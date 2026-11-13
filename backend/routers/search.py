from fastapi import APIRouter, HTTPException
import sqlite3
import uuid
from datetime import datetime
import os
import json

BASE_DIR = os.path.dirname(__file__)

# import our decoupled schemas
from schema import SignupRequest, GroupCreateRequest, SearchRequest, InterestsUpdateRequest

router = APIRouter()
DB_FILE = os.path.join(BASE_DIR, "..", "hackathon.db")

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

        for interest in req.interests:
            cursor.execute("INSERT INTO traveller_interests (traveller_id, interest_id) VALUES (?, ?)",
                           (traveller_id, interest))

        conn.commit()

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        conn.close()

    return {"message": "Signup successful", "traveller_id": traveller_id}

# List all existing travellers (e.g. 24 seeded travellers from database)
@router.get("/api/users")
def get_all_users():
    conn = get_db()
    cursor = conn.cursor()
    travellers = cursor.execute("SELECT * FROM travellers ORDER BY traveller_id ASC").fetchall()
    users = []
    for t in travellers:
        t_dict = dict(t)
        int_rows = cursor.execute("SELECT interest_id FROM traveller_interests WHERE traveller_id = ?", (t["traveller_id"],)).fetchall()
        t_dict["interests"] = [r["interest_id"] for r in int_rows]
        users.append(t_dict)
    conn.close()
    return {"users": users}

# Get single user profile
@router.get("/api/users/{traveller_id}")
def get_user(traveller_id: str):
    conn = get_db()
    cursor = conn.cursor()
    t = cursor.execute("SELECT * FROM travellers WHERE traveller_id = ?", (traveller_id,)).fetchone()
    if not t:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    t_dict = dict(t)
    int_rows = cursor.execute("SELECT interest_id FROM traveller_interests WHERE traveller_id = ?", (traveller_id,)).fetchall()
    t_dict["interests"] = [r["interest_id"] for r in int_rows]
    conn.close()
    return {"user": t_dict}


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
        """, (group_id, req.name, req.owner_id, req.city, req.check_in, req.check_out, req.max_size, req.budget_inr, req.itinerary))

        # adding owner as the first group member automatically
        cursor.execute("INSERT INTO group_members (group_id, traveller_id) VALUES (?, ?)", (group_id, req.owner_id))

        # Save owner interests if provided so matching algorithm can find this group
        if req.interests:
            for interest in req.interests:
                cursor.execute("INSERT OR IGNORE INTO traveller_interests (traveller_id, interest_id) VALUES (?, ?)", (req.owner_id, interest))

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

    # Persist seeker interests so their profile is updated for join requests and roster
    if req.interests:
        for interest in req.interests:
            cursor.execute("INSERT OR IGNORE INTO traveller_interests (traveller_id, interest_id) VALUES (?, ?)", (req.traveller_id, interest))
        conn.commit()

    # Load interest label map for clear match explanations
    interests_path = os.path.join(BASE_DIR, "..", "..", "data", "problem-3", "interests.json")
    interest_label_map = {}
    try:
        with open(interests_path, "r") as f:
            for item in json.load(f):
                interest_label_map[item["interest"]] = item["label"]
    except Exception:
        pass

    # rule 1: same destination & not locked
    potential_groups = cursor.execute("SELECT * FROM groups WHERE LOWER(TRIM(city)) = LOWER(TRIM(?)) AND is_locked = 0", (req.city,)).fetchall()
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
        overlap_start = max(seeker_in, group_in)
        overlap_end = min(seeker_out, group_out)
        shared_nights = (overlap_end - overlap_start).days
        if shared_nights < 2: continue

        # rule 3: budget compatibility (diff <= 40% of lower)
        lower_budget = min(req.budget_inr, group["budget_inr"])
        budget_diff = abs(req.budget_inr - group["budget_inr"])
        if lower_budget > 0 and budget_diff > (0.4 * lower_budget): continue
        variance_pct = round((budget_diff / lower_budget) * 100) if lower_budget > 0 else 0

        # get owner details for rules 4 & 5
        owner = cursor.execute("SELECT name, gender, gender_preference FROM travellers WHERE traveller_id = ?", (group["owner_id"],)).fetchone()
        owner_interests_rows = cursor.execute("SELECT interest_id FROM traveller_interests WHERE traveller_id = ?", (group["owner_id"],)).fetchall()
        owner_interests = set([row["interest_id"] for row in owner_interests_rows])
        
        # rule 4: shared interests (>= 2)
        shared_interest_ids = list(seeker_interests.intersection(owner_interests))
        shared_interest_count = len(shared_interest_ids)
        if shared_interest_count < 2: continue

        # rule 5: gender preference (both ways)
        if seeker["gender_preference"] == "SAME_GENDER" and seeker["gender"] != owner["gender"]: continue
        if owner["gender_preference"] == "SAME_GENDER" and owner["gender"] != seeker["gender"]: continue

        # Clear match scoring calculation (explained match breakdown)
        shared_names = [interest_label_map.get(i, i) for i in shared_interest_ids]
        seeker_nights = max(2, (seeker_out - seeker_in).days)
        int_ratio = min(1.0, shared_interest_count / max(2, len(seeker_interests)))
        date_ratio = min(1.0, shared_nights / seeker_nights)
        bud_ratio = max(0.0, 1.0 - (budget_diff / (0.4 * lower_budget))) if lower_budget > 0 else 1.0
        match_score = int(round((int_ratio * 45) + (date_ratio * 35) + (bud_ratio * 20)))
        match_score = max(55, min(99, match_score))

        match_reasons = [
            f"{shared_interest_count} shared interests ({', '.join(shared_names)})",
            f"{shared_nights} nights overlapping ({overlap_start.strftime('%Y-%m-%d')} to {overlap_end.strftime('%Y-%m-%d')})",
            f"Budget within {variance_pct}% (₹{req.budget_inr:,} vs ₹{group['budget_inr']:,})",
            f"Safety verified: {seeker['gender'].capitalize()} travel group"
        ]

        matches.append({
            "group_id": group["group_id"],
            "name": group["name"],
            "city": group["city"],
            "dates": f"{group['check_in']} to {group['check_out']}",
            "check_in": group["check_in"],
            "check_out": group["check_out"],
            "member_count": member_count,
            "max_size": group["max_size"],
            "budget_inr": group["budget_inr"],
            "budget_variance_pct": variance_pct,
            "owner_id": group["owner_id"],
            "owner_name": owner["name"],
            "owner_gender": owner["gender"],
            "shared_nights": shared_nights,
            "shared_interests_count": shared_interest_count,
            "shared_interests": shared_interest_ids,
            "shared_interest_names": shared_names,
            "match_score": match_score,
            "match_reasons": match_reasons
        })

    conn.close()
    matches.sort(key=lambda x: (x["match_score"], x["shared_interests_count"], x["shared_nights"]), reverse=True)
    return {"matches": matches}


# interests List
@router.get("/api/interests")
def get_interests():
    interests_path = os.path.join(BASE_DIR, "..", "..", "data", "problem-3", "interests.json")
    with open(interests_path, "r") as f:
        interests = json.load(f)
    return {"interests": interests}

# destinations list
@router.get("/api/destinations")
def get_destinations():
    dest_path = os.path.join(BASE_DIR, "..", "..", "data", "catalog", "destinations.json")
    with open(dest_path, "r") as f:
        data = json.load(f)
    cities = []
    for country in data.get("countries", []):
        for city in country.get("cities", []):
            cities.append({
                "name": city["name"],
                "country": country["name"],
                "country_code": country["code"]
            })
    departure_cities = [d["city"] for d in data.get("departure_cities", [])]
    return {"destinations": cities, "departure_cities": departure_cities}

# Update user interests
@router.post("/api/users/{traveller_id}/interests")
@router.put("/api/users/{traveller_id}/interests")
def update_user_interests(traveller_id: str, req: InterestsUpdateRequest):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM traveller_interests WHERE traveller_id = ?", (traveller_id,))
        for interest in req.interests:
            cursor.execute("INSERT OR IGNORE INTO traveller_interests (traveller_id, interest_id) VALUES (?, ?)", (traveller_id, interest))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
    return {"message": "Interests updated successfully"}
