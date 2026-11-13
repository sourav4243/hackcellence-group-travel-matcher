from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# import our database initializer and our decoupled routers
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

# run database setup on startup
@app.on_event("startup")
def startup_event():
    init_db()

# wire up the routers
app.include_router(search.router)
app.include_router(workspace.router)

@app.get("/")
def health_check():
    return {"status": "Backend is running, Database is seeded, and Routers are securely wired!"}