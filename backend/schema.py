from pydantic import BaseModel
from typing import List

# lakshy's schemas (M1, M2, M3)
class SignupRequest(BaseModel):
    name: str
    gender: str
    home_city: str
    gender_preference: str
    interests: List[str]

class GroupCreateRequest(BaseModel):
    owner_id: str
    name: str
    city: str
    check_in: str
    check_out: str
    max_size: int
    budget_inr: int
    itinerary: str

class SearchRequest(BaseModel):
    traveller_id: str
    city: str
    check_in: str
    check_out: str
    budget_inr: int
    interests: List[str]

# sourav's schemas (M5)
class JoinRequest(BaseModel):
    traveller_id: str