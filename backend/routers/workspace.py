from fastapi import APIRouter, HTTPException
import sqlite3
import json
import math
from datetime import datetime, timedelta
import os
import uuid

from schema import JoinRequest, BookRequest

router = APIRouter()
DB_FILE = "hackathon.db"
BASE_DIR = os.path.dirname(__file__)

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

# M5: join group
@router.post("/api/groups/{group_id}/join")
def join_group(group_id: str, req: JoinRequest):
    conn = get_db()
    cursor = conn.cursor()
    
    group = cursor.execute("SELECT max_size, is_locked FROM groups WHERE group_id = ?", (group_id,)).fetchone()
    if not group: raise HTTPException(status_code=404, detail="Group not found")
    if group["is_locked"]: raise HTTPException(status_code=400, detail="Group is locked.")
        
    member_count = cursor.execute("SELECT COUNT(*) FROM group_members WHERE group_id = ?", (group_id,)).fetchone()[0]
    if member_count >= group["max_size"]: raise HTTPException(status_code=400, detail="Group is full")

    if cursor.execute("SELECT 1 FROM group_members WHERE group_id = ? AND traveller_id = ?", (group_id, req.traveller_id)).fetchone():
        raise HTTPException(status_code=400, detail="User already in group")

    if cursor.execute("SELECT 1 FROM join_requests WHERE group_id = ? AND traveller_id = ? AND status = 'PENDING'", (group_id, req.traveller_id)).fetchone():
        raise HTTPException(status_code=400, detail="Join request already pending")

    request_id = f"JR-{str(uuid.uuid4())[:6].upper()}"
    try:
        cursor.execute("INSERT INTO join_requests (request_id, group_id, traveller_id, status, created_at) VALUES (?, ?, ?, 'PENDING', ?)",
            (request_id, group_id, req.traveller_id, datetime.utcnow().isoformat()))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
        
    return {"message": "Join request sent!", "request_id": request_id}

# M5: get pending join requests
@router.get("/api/groups/{group_id}/requests")
def get_join_requests(group_id: str):
    conn = get_db()
    cursor = conn.cursor()
    requests = cursor.execute("SELECT * FROM join_requests WHERE group_id = ? AND status = 'PENDING'", (group_id,)).fetchall()
    
    result = []
    for r in requests:
        traveller = cursor.execute("SELECT * FROM travellers WHERE traveller_id = ?", (r["traveller_id"],)).fetchone()
        interests_rows = cursor.execute("SELECT interest_id FROM traveller_interests WHERE traveller_id = ?", (r["traveller_id"],)).fetchall()
        profile = dict(traveller) if traveller else {}
        profile["interests"] = [row["interest_id"] for row in interests_rows]
        result.append({"request_id": r["request_id"], "group_id": r["group_id"], "traveller_id": r["traveller_id"], "status": r["status"], "profile": profile})

    conn.close()
    return {"requests": result}

# M5: approve join requests
@router.post("/api/groups/{group_id}/requests/{request_id}/approve")
def approve_request(group_id: str, request_id: str):
    conn = get_db()
    cursor = conn.cursor()
    req = cursor.execute("SELECT * FROM join_requests WHERE request_id = ? AND group_id = ?", (request_id, group_id)).fetchone()
    
    if not req or req["status"] != "PENDING": raise HTTPException(status_code=400, detail="Invalid request")
    
    try:
        cursor.execute("UPDATE join_requests SET status = 'APPROVED' WHERE request_id = ?", (request_id,))
        cursor.execute("INSERT OR IGNORE INTO group_members (group_id, traveller_id) VALUES (?, ?)", (group_id, req["traveller_id"]))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
    return {"message": "Request approved"}

# M6: workspace roster
@router.get("/api/groups/{group_id}/workspace")
def get_workspace(group_id: str):
    conn = get_db()
    cursor = conn.cursor()

    group = cursor.execute("SELECT * FROM groups WHERE group_id = ?", (group_id,)).fetchone()
    members = cursor.execute("SELECT t.* FROM travellers t JOIN group_members gm ON t.traveller_id = gm.traveller_id WHERE gm.group_id = ?", (group_id,)).fetchall()
    
    members_list = []
    for m in members:
        md = dict(m)
        interests_rows = cursor.execute("SELECT interest_id FROM traveller_interests WHERE traveller_id = ?", (m["traveller_id"],)).fetchall()
        md["interests"] = [row["interest_id"] for row in interests_rows]
        members_list.append(md)
        
    conn.close()
    return {"group": dict(group), "members": members_list}

# M6: hotel search and cost split math
@router.get("/api/groups/{group_id}/hotels")
def search_group_hotels(group_id: str):
    conn = get_db()
    cursor = conn.cursor()
    
    group = cursor.execute("SELECT city, check_in, check_out FROM groups WHERE group_id = ?", (group_id,)).fetchone()
    member_count = cursor.execute("SELECT COUNT(*) FROM group_members WHERE group_id = ?", (group_id,)).fetchone()[0]
    conn.close()

    if member_count == 0: return {"options": []}

    check_in_date = datetime.strptime(group["check_in"], "%Y-%m-%d")
    nights = (datetime.strptime(group["check_out"], "%Y-%m-%d") - check_in_date).days
    stay_dates = [(check_in_date + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(nights)]

    base = os.path.join(BASE_DIR, "..", "..", "data", "catalog")
    with open(os.path.join(base, "hotels.json"), "r") as f: hotels = json.load(f)
    with open(os.path.join(base, "rooms.json"), "r") as f: rooms = json.load(f)
    with open(os.path.join(base, "availability.json"), "r") as f: availability = json.load(f)

    city_hotels = [h for h in hotels if h["city"] == group["city"]]
    valid_options = []
    
    for hotel in city_hotels:
        hotel_rooms = [r for r in rooms if r["hotel_id"] == hotel["hotel_id"]]
        for room in hotel_rooms:
            req_rooms = math.ceil(member_count / room["max_adults"])
            is_available = True
            
            for date in stay_dates:
                avail = next((a for a in availability if a["room_id"] == room["room_id"] and a["date"] == date), None)
                if not avail or avail["rooms_left"] < req_rooms:
                    is_available = False
                    break
            
            if is_available:
                total_cost = req_rooms * room["price_per_night"]["amount"] * nights
                valid_options.append({
                    "hotel_name": hotel["name"],
                    "rating": hotel["rating"],
                    "image": hotel.get("image", ""),
                    "room_name": room["name"],
                    "total_cost_inr": total_cost,
                    "per_person_inr": int(total_cost / member_count)
                })
                
    return {"options": sorted(valid_options, key=lambda x: x["per_person_inr"])}

# M6: lock booking
@router.post("/api/groups/{group_id}/book")
def lock_booking(group_id: str, req: BookRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE groups SET is_locked = 1, booked_hotel = ?, booked_room = ? WHERE group_id = ?",
        (req.hotel_name, req.room_name, group_id))
    conn.commit()
    conn.close()
    return {"message": "Booking locked", "booking_id": f"BKG-{group_id}"}