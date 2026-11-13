import sqlite3
import json
import os
import sys

DB_FILE = os.path.join(os.path.dirname(__file__), "hackathon.db")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "problem-3")

def create_tables(conn):
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS travellers (
            traveller_id TEXT PRIMARY KEY,
            name TEXT,
            gender TEXT,
            home_city TEXT,
            gender_preference TEXT
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS traveller_interests (
            traveller_id TEXT,
            interest_id TEXT,
            PRIMARY KEY (traveller_id, interest_id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS groups (
            group_id TEXT PRIMARY KEY,
            name TEXT,
            owner_id TEXT,
            city TEXT,
            check_in TEXT,
            check_out TEXT,
            max_size INTEGER,
            budget_inr INTEGER,
            itinerary TEXT,
            is_locked BOOLEAN DEFAULT 0,
            booked_hotel TEXT,
            booked_room TEXT
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS group_members (
            group_id TEXT,
            traveller_id TEXT,
            PRIMARY KEY (group_id, traveller_id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS join_requests (
            request_id TEXT PRIMARY KEY,
            group_id TEXT,
            traveller_id TEXT,
            status TEXT DEFAULT 'PENDING',
            created_at TEXT
        )
    ''')
    conn.commit()

def seed_data(conn):
    cursor = conn.cursor()
    print("Seeding database from JSON dataset...")
    
    # seed travellers
    with open(os.path.join(DATA_DIR, "travellers.json"), "r") as f:
        travellers = json.load(f)
        for t in travellers:
            cursor.execute("""
                INSERT OR REPLACE INTO travellers (traveller_id, name, gender, home_city, gender_preference)
                VALUES (?, ?, ?, ?, ?)
            """, (t["traveller_id"], t["name"], t["gender"], t["home_city"], t["gender_preference"]))
            
            for interest in t.get("interests", []):
                cursor.execute("INSERT OR IGNORE INTO traveller_interests (traveller_id, interest_id) VALUES (?, ?)",
                               (t["traveller_id"], interest))
    
    # seed groups
    with open(os.path.join(DATA_DIR, "groups.json"), "r") as f:
        groups = json.load(f)
        for g in groups:
            cursor.execute("""
                INSERT OR REPLACE INTO groups (group_id, name, owner_id, city, check_in, check_out, max_size, budget_inr, itinerary, is_locked)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """, (g["group_id"], g["name"], g["owner_id"], g["city"], g["check_in"], g["check_out"], g["max_size"], g["budget_inr"], g["itinerary"]))
            
            for member_id in g.get("member_ids", []):
                cursor.execute("INSERT OR IGNORE INTO group_members (group_id, traveller_id) VALUES (?, ?)",
                               (g["group_id"], member_id))

    conn.commit()
    print(f"Database seeded successfully with {len(travellers)} travellers and {len(groups)} groups.")

def init_db():
    conn = sqlite3.connect(DB_FILE)
    create_tables(conn)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM travellers")
    if cursor.fetchone()[0] == 0:
        seed_data(conn)
    conn.close()

def reset_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    print("Dropping existing tables for clean re-seed...")
    cursor.execute("DROP TABLE IF EXISTS join_requests")
    cursor.execute("DROP TABLE IF EXISTS group_members")
    cursor.execute("DROP TABLE IF EXISTS groups")
    cursor.execute("DROP TABLE IF EXISTS traveller_interests")
    cursor.execute("DROP TABLE IF EXISTS travellers")
    conn.commit()
    create_tables(conn)
    seed_data(conn)
    conn.close()
    print("Reset complete! Ready for fresh demo.")

if __name__ == "__main__":
    reset_db()
