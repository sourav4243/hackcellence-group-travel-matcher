from fastapi import APIRouter, HTTPException
import sqlite3
import json
import math
from datetime import datetime, timedelta
import os

from schema import JoinRequest

router = APIRouter()
DB_FILE = "hackathon.db"

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
        
    try:
        cursor.execute("INSERT INTO group_members (group_id, traveller_id) VALUES (?, ?)", (group_id, req.traveller_id))
        conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="User already in group")
    finally:
        conn.close()
        
    return {"message": "Joined successfully!"}

# M6: workspace roster
@router.get("/api/groups/{group_id}/workspace")
def get_workspace(group_id: str):
    conn = get_db()
    cursor = conn.cursor()
    
    group = cursor.execute("SELECT * FROM groups WHERE group_id = ?", (group_id,)).fetchone()
    if not group: raise HTTPException(status_code=404, detail="Group not found")

    members = cursor.execute("""
        SELECT t.* FROM travellers t JOIN group_members gm ON t.traveller_id = gm.traveller_id WHERE gm.group_id = ?
    """, (group_id,)).fetchall()
    
    conn.close()
    return {"group": dict(group), "members": [dict(m) for m in members]}

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

    base = os.path.join(os.path.dirname(__file__), "..", "..", "data", "catalog")
    with open(f"{base}/hotels.json", "r") as f: hotels = json.load(f)
    with open(f"{base}/rooms.json", "r") as f: rooms = json.load(f)
    with open(f"{base}/availability.json", "r") as f: availability = json.load(f)

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
                    "image": hotel["image"],
                    "room_name": room["name"],
                    "total_cost_inr": total_cost,
                    "per_person_inr": int(total_cost / member_count)
                })
                
    return {"options": sorted(valid_options, key=lambda x: x["per_person_inr"])}

# M6: lock booking
@router.post("/api/groups/{group_id}/book")
def lock_booking(group_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE groups SET is_locked = 1 WHERE group_id = ?", (group_id,))
    conn.commit()
    conn.close()
    return {"message": "Booking locked", "booking_id": f"BKG-{group_id}"}