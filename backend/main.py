from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db import init_db
from routers import search, workspace

app = FastAPI(title="Group Travel Matcher")

# allow frontend to make requests without CORS blocking
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# this initializes DB and seed data on startup
init_db()

# connect the separate feature branches
app.include_router(search.router)
app.include_router(workspace.router)

@app.get("/")
def health_check():
    return {"status": "Backend is running!"}