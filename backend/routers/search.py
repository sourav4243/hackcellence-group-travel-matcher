from fastapi import APIRouter, HTTPException
import sqlite3
import uuid
from datetime import datetime

# import our decoupled schemas
from schema import SignupRequest, GroupCreateRequest, SearchRequest

router = APIRouter()
DB_FILE = "hackathon.db"

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


# M1: Sign up
@router.post("/api/users/signup")
def signup(req: SignupRequest):
    conn = get_db()
    cursor = conn.cursor()
    traveller_id = f"T-{str(uuid.uuid4())[:6].upper()}"

    try: 
        cursor.execute("""
        INSERT INTO travellers (traveller_id, name, gender, home_city, gender_preference)
        VALUES (?, ?, ?, ?, ?)
    """, (traveller_id, req.name, req.gender, req.home_city, req.gender_preference))

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        conn.close()

    return {"message": "Signup successful", "traveller_id": traveller_id}

# M2: Create Group Post
@router.post("/api/groups")
def create_group(req: GroupCreateRequest):
    conn = get_db()
    cursor = conn.cursor()
    group_id = f"G-{str(uuid.uuid4())[:6].upper()}"

    try:
        cursor.execute("""
            INSERT INTO groups (group_id, name, owner_id, city, check_in, check_out, max_size, budget_inr, itinerary, is_locked)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """, (group_id, req.name, req.owner_id, req.city, req.check_in, req.check_out, req.max_size, req.budget_inr, req.itinerary, req.max_size))

        # adding owner as the first group member automatically
        cursor.execute("INSERT INTO group_members (group_id, traveller_id) VALUES (?, ?)", (group_id, req.owner_id))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail = str(e))
    finally:
        conn.close()

    return {"message": "Group created successfully", "group_id": group_id}



# M3 & M4: traveller search (The 6-rule rngine)
@router.post("/api/search")
def search_groups(req: SearchRequest):
    conn = get_db()
    cursor = conn.cursor()
    
    seeker = cursor.execute("SELECT gender, gender_preference FROM travellers WHERE traveller_id = ?", (req.traveller_id,)).fetchone()
    if not seeker:
        raise HTTPException(status_code=404, detail="Seeker not found")

    # rule 1: same destination & not locked
    potential_groups = cursor.execute("SELECT * FROM groups WHERE city = ? AND is_locked = 0", (req.city,)).fetchall()
    matches = []
    
    seeker_in = datetime.strptime(req.check_in, "%Y-%m-%d")
    seeker_out = datetime.strptime(req.check_out, "%Y-%m-%d")
    seeker_interests = set(req.interests)

    for group in potential_groups:
        group_id = group["group_id"]
        
        # rule 6: group size
        member_count = cursor.execute("SELECT COUNT(*) FROM group_members WHERE group_id = ?", (group_id,)).fetchone()[0]
        if member_count + 1 > group["max_size"]: continue

        # rule 2: date overlap (>= 2 nights)
        group_in = datetime.strptime(group["check_in"], "%Y-%m-%d")
        group_out = datetime.strptime(group["check_out"], "%Y-%m-%d")
        shared_nights = (min(seeker_out, group_out) - max(seeker_in, group_in)).days
        if shared_nights < 2: continue

        # rule 3: budget compatibility (diff <= 40% of lower)
        if abs(req.budget_inr - group["budget_inr"]) > (0.4 * min(req.budget_inr, group["budget_inr"])): continue

        # get owner details for rules 4 & 5
        owner = cursor.execute("SELECT gender, gender_preference FROM travellers WHERE traveller_id = ?", (group["owner_id"],)).fetchone()
        owner_interests_rows = cursor.execute("SELECT interest_id FROM traveller_interests WHERE traveller_id = ?", (group["owner_id"],)).fetchall()
        owner_interests = set([row["interest_id"] for row in owner_interests_rows])
        
        # rule 4: shared interests (>= 2)
        shared_interest_count = len(seeker_interests.intersection(owner_interests))
        if shared_interest_count < 2: continue

        # rule 5: gender preference (both ways)
        if seeker["gender_preference"] == "SAME_GENDER" and seeker["gender"] != owner["gender"]: continue
        if owner["gender_preference"] == "SAME_GENDER" and owner["gender"] != seeker["gender"]: continue

        owner_name = cursor.execute("SELECT name FROM travellers WHERE traveller_id = ?", (group["owner_id"],)).fetchone()[0]
        matches.append({
            "group_id": group["group_id"],
            "name": group["name"],
            "city": group["city"],
            "dates": f"{group['check_in']} to {group['check_out']}",
            "member_count": member_count,
            "max_size": group["max_size"],
            "owner_name": owner_name,
            "shared_nights": shared_nights,
            "shared_interests_count": shared_interest_count
        })

    conn.close()
    matches.sort(key=lambda x: (x["shared_interests_count"], x["shared_nights"]), reverse=True)
    return {"matches": matches}