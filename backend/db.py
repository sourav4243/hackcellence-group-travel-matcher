import sqlite3
import json
import os

DB_FILE = "hackathon.db"
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "problem-3")

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # table creation
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
            is_locked BOOLEAN DEFAULT 0
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS group_members (
            group_id TEXT,
            traveller_id TEXT,
            PRIMARY KEY (group_id, traveller_id)
        )
    ''')


    # seed data if empty
    cursor.execute("SELECT COUNT(*) FROM travellers")
    if cursor.fetchone()[0] == 0:
        print("Seeding database from JSON data pack...")
        
        # seed travellers
        with open(os.path.join(DATA_DIR, "travellers.json"), "r") as f:
            travellers = json.load(f)
            for t in travellers:
                cursor.execute("""
                    INSERT INTO travellers (traveller_id, name, gender, home_city, gender_preference)
                    VALUES (?, ?, ?, ?, ?)
                """, (t["traveller_id"], t["name"], t["gender"], t["home_city"], t["gender_preference"]))
                
                for interest in t.get("interests", []):
                    cursor.execute("INSERT INTO traveller_interests (traveller_id, interest_id) VALUES (?, ?)",
                                   (t["traveller_id"], interest))
        
        # seed groups
        with open(os.path.join(DATA_DIR, "groups.json"), "r") as f:
            groups = json.load(f)
            for g in groups:
                cursor.execute("""
                    INSERT INTO groups (group_id, name, owner_id, city, check_in, check_out, max_size, budget_inr, itinerary, is_locked)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                """, (g["group_id"], g["name"], g["owner_id"], g["city"], g["check_in"], g["check_out"], g["max_size"], g["budget_inr"], g["itinerary"]))
                
                for member_id in g.get("member_ids", []):
                    cursor.execute("INSERT OR IGNORE INTO group_members (group_id, traveller_id) VALUES (?, ?)",
                                   (g["group_id"], member_id))

        conn.commit()
        print("Database seeded successfully.")
    
    conn.close()