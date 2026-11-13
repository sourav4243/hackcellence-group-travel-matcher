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