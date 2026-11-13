const BASE_URL = "http://127.0.0.1:8000/api";

// Helper to make requests
async function fetchAPI(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);
    
    try {
        const res = await fetch(`${BASE_URL}${endpoint}`, options);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'API Error');
        return data;
    } catch (err) {
        console.error(`Error on ${endpoint}:`, err);
        throw err;
    }
}

// --- LAKSHY'S FRONTEND FUNCTIONS ---

// 1. M1: Sign Up
export async function signUpUser(userData) {
    // userData = { name, gender, home_city, gender_preference, interests: ["TEMPLES", "HIKING"] }
    return await fetchAPI('/users/signup', 'POST', userData);
}

// 2. M2: Create Group
export async function createGroupPost(groupData) {
    // groupData = { owner_id, name, city, check_in, check_out, max_size, budget_inr, itinerary }
    return await fetchAPI('/groups', 'POST', groupData);
}

// 3. M3 & M4: Search Matching Groups
export async function searchGroups(searchData) {
    // searchData = { traveller_id, city, check_in, check_out, budget_inr, interests: ["TEMPLES"] }
    return await fetchAPI('/search', 'POST', searchData);
}

// 4. M5: Join a Group
export async function joinGroup(groupId, travellerId) {
    return await fetchAPI(`/groups/${groupId}/join`, 'POST', { traveller_id: travellerId });
}

// 5. M6: Get Group Dashboard Data
export async function getGroupWorkspace(groupId) {
    return await fetchAPI(`/groups/${groupId}/workspace`);
}

// 6. M6: Get Hotel Cost Splits
export async function getHotelOptions(groupId) {
    return await fetchAPI(`/groups/${groupId}/hotels`);
}

// 7. M6: Lock the Booking
export async function finalizeBooking(groupId) {
    return await fetchAPI(`/groups/${groupId}/book`, 'POST');
}