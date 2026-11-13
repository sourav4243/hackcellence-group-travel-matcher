from fastapi import APIRouter, HTTPException
import sqlite3
import json
import math
from datetime import datetime, timedelta
import os
import uuid

from schema import JoinRequest, BookRequest, GroupUpdateRequest

router = APIRouter()
BASE_DIR = os.path.dirname(__file__)
DB_FILE = os.path.join(BASE_DIR, "..", "hackathon.db")

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
        if req.interests:
            for interest in req.interests:
                cursor.execute("INSERT OR IGNORE INTO traveller_interests (traveller_id, interest_id) VALUES (?, ?)", (req.traveller_id, interest))

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
    if nights <= 0:
        nights = 1
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
                # If availability record exists, check rooms_left; otherwise assume available
                if avail is not None and avail["rooms_left"] < req_rooms:
                    is_available = False
                    break
            
            if is_available:
                total_cost = req_rooms * room["price_per_night"]["amount"] * nights
                valid_options.append({
                    "hotel_name": hotel["name"],
                    "rating": hotel["rating"],
                    "stars": hotel.get("stars", 0),
                    "area": hotel.get("area", ""),
                    "image": hotel.get("image", ""),
                    "room_name": room["name"],
                    "req_rooms": req_rooms,
                    "price_per_night": room["price_per_night"]["amount"],
                    "nights": nights,
                    "member_count": member_count,
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

# M6: unlock group / cancel booking lock
@router.post("/api/groups/{group_id}/unlock")
def unlock_group(group_id: str):
    conn = get_db()
    cursor = conn.cursor()
    group = cursor.execute("SELECT group_id FROM groups WHERE group_id = ?", (group_id,)).fetchone()
    if not group:
        conn.close()
        raise HTTPException(status_code=404, detail="Group not found")
    cursor.execute("UPDATE groups SET is_locked = 0, booked_hotel = NULL, booked_room = NULL WHERE group_id = ?", (group_id,))
    conn.commit()
    conn.close()
    return {"message": "Group unlocked successfully", "is_locked": False}

# Edit / Update group details
@router.put("/api/groups/{group_id}")
def update_group(group_id: str, req: GroupUpdateRequest):
    conn = get_db()
    cursor = conn.cursor()
    group = cursor.execute("SELECT * FROM groups WHERE group_id = ?", (group_id,)).fetchone()
    if not group:
        conn.close()
        raise HTTPException(status_code=404, detail="Group not found")

    fields = []
    values = []
    if req.name is not None:
        fields.append("name = ?")
        values.append(req.name)
    if req.city is not None:
        fields.append("city = ?")
        values.append(req.city)
    if req.check_in is not None:
        fields.append("check_in = ?")
        values.append(req.check_in)
    if req.check_out is not None:
        fields.append("check_out = ?")
        values.append(req.check_out)
    if req.max_size is not None:
        fields.append("max_size = ?")
        values.append(req.max_size)
    if req.budget_inr is not None:
        fields.append("budget_inr = ?")
        values.append(req.budget_inr)
    if req.itinerary is not None:
        fields.append("itinerary = ?")
        values.append(req.itinerary)

    if fields:
        values.append(group_id)
        cursor.execute(f"UPDATE groups SET {', '.join(fields)} WHERE group_id = ?", values)

    if req.interests and group["owner_id"]:
        for interest in req.interests:
            cursor.execute("INSERT OR IGNORE INTO traveller_interests (traveller_id, interest_id) VALUES (?, ?)", (group["owner_id"], interest))

    conn.commit()
    conn.close()
    return {"message": "Group updated successfully"}

# Delete group and related members/requests
@router.delete("/api/groups/{group_id}")
def delete_group(group_id: str):
    conn = get_db()
    cursor = conn.cursor()
    group = cursor.execute("SELECT group_id FROM groups WHERE group_id = ?", (group_id,)).fetchone()
    if not group:
        conn.close()
        raise HTTPException(status_code=404, detail="Group not found")
    cursor.execute("DELETE FROM join_requests WHERE group_id = ?", (group_id,))
    cursor.execute("DELETE FROM group_members WHERE group_id = ?", (group_id,))
    cursor.execute("DELETE FROM groups WHERE group_id = ?", (group_id,))
    conn.commit()
    conn.close()
    return {"message": "Group deleted successfully", "group_id": group_id}

# Clean database re-seed endpoint for fresh demos
@router.post("/api/admin/reset-db")
def admin_reset_database():
    import sys
    sys.path.insert(0, os.path.join(BASE_DIR, ".."))
    from db import reset_db
    reset_db()
    return {"message": "Database re-seeded cleanly from original JSON catalog."}

# M5: decline join request
@router.post("/api/groups/{group_id}/requests/{request_id}/decline")
def decline_request(group_id: str, request_id: str):
    conn = get_db()
    cursor = conn.cursor()
    req = cursor.execute("SELECT * FROM join_requests WHERE request_id = ? AND group_id = ?", (request_id, group_id)).fetchone()

    if not req or req["status"] != "PENDING":
        raise HTTPException(status_code=400, detail="Invalid request")

    try:
        cursor.execute("UPDATE join_requests SET status = 'DECLINED' WHERE request_id = ?", (request_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
    return {"message": "Request declined"}

# Dashboard: get user's groups
@router.get("/api/users/{traveller_id}/groups")
def get_user_groups(traveller_id: str):
    conn = get_db()
    cursor = conn.cursor()

    rows = cursor.execute("""
        SELECT g.*
        FROM groups g
        JOIN group_members gm ON g.group_id = gm.group_id
        WHERE gm.traveller_id = ?
    """, (traveller_id,)).fetchall()

    groups = []
    for row in rows:
        member_count = cursor.execute(
            "SELECT COUNT(*) FROM group_members WHERE group_id = ?",
            (row["group_id"],)
        ).fetchone()[0]
        role = "owner" if row["owner_id"] == traveller_id else "member"
        groups.append({
            "group_id": row["group_id"],
            "name": row["name"],
            "city": row["city"],
            "check_in": row["check_in"],
            "check_out": row["check_out"],
            "max_size": row["max_size"],
            "budget_inr": row["budget_inr"],
            "member_count": member_count,
            "is_locked": bool(row["is_locked"]),
            "role": role
        })

    conn.close()
    return {"groups": groups}
