from pydantic import BaseModel
from typing import List

# m1: sign up
class SignupRequest(BaseModel):
    name: str
    gender: str
    home_city: str
    gender_preference: str
    interests: List[str]

# m2: create group post
class GroupCreateRequest(BaseModel):
    owner_id: str
    name: str
    city: str
    check_in: str
    check_out: str
    max_size: int
    budget_inr: int
    itinerary: str


# m3/m4: search groups
class SearchRequest(BaseModel):
    traveller_id: str
    city: str
    check_in: str
    check_out: str
    budget_inr: int
    interests: List[str]

# join group
class JoinRequest(BaseModel):
    traveller_id: str