from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# import our database initializer and our decoupled routers
from db import init_db 
from routers import search, workspace

# modern FastAPI lifespan handler (replaces on_event which is now depricated)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # this runs exactly once when the server boots up
    init_db()
    yield
    # anything after yield would run on server shutdown

# pass the lifespan into the app
app = FastAPI(title="Group Travel Matcher", lifespan=lifespan)

# allow frontend to make requests without CORS blocking
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# wire up the routers
app.include_router(search.router)
app.include_router(workspace.router)

@app.get("/")
def health_check():
    return {"status": "Backend is running, Database is seeded, and Routers are securely wired!"}