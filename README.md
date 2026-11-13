# Group Travel Matcher

## How to run the Backend

**1. Create and activate a virtual environment:**
Make sure you are in the root folder of the project, then run:

```bash
# Create the virtual environment
python3 -m venv venv

# Activate it on Linux/macOS:
source venv/bin/activate

# Activate it on Windows:
venv\Scripts\activate
```

**2. Install dependencies and start the server:**

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

**3. Access the APIs:**
* The backend will run at: `http://127.0.0.1:8000`
* View the auto-generated API Documentation: `http://127.0.0.1:8000/docs`

*(Note: The SQLite database `hackathon.db` is created and seeded automatically from the JSON files on the first run).*

---

## How to run the Frontend

1. Keep the backend running in your first terminal.
2. Navigate to the `frontend` folder in your file explorer.
3. Open `index.html` in your browser (or use VS Code Live Server). 
4. The frontend will automatically connect to the local backend on port `8000`.