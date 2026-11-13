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

// 1. M1: Sign Up (interests optional / not required)
export async function signUpUser(userData) {
    return await fetchAPI('/users/signup', 'POST', userData);
}

// 2. M2: Create Group (supports custom dates & interests)
export async function createGroupPost(groupData) {
    return await fetchAPI('/groups', 'POST', groupData);
}

// 3. M3 & M4: Search Matching Groups
export async function searchGroups(searchData) {
    return await fetchAPI('/search', 'POST', searchData);
}

// 4. M5: Join a Group
export async function joinGroup(groupId, travellerId, interests = []) {
    return await fetchAPI(`/groups/${groupId}/join`, 'POST', { traveller_id: travellerId, interests });
}

// 5. M6: Get Group Dashboard Data
export async function getGroupWorkspace(groupId) {
    return await fetchAPI(`/groups/${groupId}/workspace`);
}

// 6. M6: Get Hotel Cost Splits & Images
export async function getHotelOptions(groupId) {
    return await fetchAPI(`/groups/${groupId}/hotels`);
}

// 7. M6: Lock the Booking
export async function finalizeBooking(groupId, bookingData = {}) {
    return await fetchAPI(`/groups/${groupId}/book`, 'POST', bookingData);
}

// 8. Interests list from data
export async function getInterests() {
    return await fetchAPI('/interests');
}

// 9. Destinations list from data
export async function getDestinations() {
    return await fetchAPI('/destinations');
}

// 10. User's joined groups
export async function getUserGroups(travellerId) {
    return await fetchAPI(`/users/${travellerId}/groups`);
}

// 11. All 24 travellers from database
export async function getAllUsers() {
    return await fetchAPI('/users');
}

// 11. Manage Requests
export async function getJoinRequests(groupId) {
    return await fetchAPI(`/groups/${groupId}/requests`);
}

export async function approveRequest(groupId, requestId) {
    return await fetchAPI(`/groups/${groupId}/requests/${requestId}/approve`, 'POST');
}

export async function declineRequest(groupId, requestId) {
    return await fetchAPI(`/groups/${groupId}/requests/${requestId}/decline`, 'POST');
}
