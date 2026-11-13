from fastapi import APIRouter, HTTPException
import sqlite3
import uuid

# import our decoupled schemas
from schema import SignupRequest, GroupCreateRequest

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
