/* ═══════════════════════════════════════════════════════════════
   Travel Matcher – Single-Page App (app.js)
   ═══════════════════════════════════════════════════════════════ */

const API = 'http://localhost:8000/api';

// ── State ───────────────────────────────────────────────────────
let travellerId = localStorage.getItem('travellerId') || null;
let userName    = localStorage.getItem('userName') || null;
let allInterests = [];
let allDestinations = [];
let currentGroupId = null;   // group being viewed in detail / workspace
let currentGroupData = null; // cached group detail for booking
let selectedHotel = null;    // hotel selected for booking
let pendingCounts = {};      // groupId → pending request count

// ── Boot ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadInterests();
  await loadDestinations();

  if (travellerId) {
    updateNav();
    showView('dashboard');
  } else {
    showView('signup');
  }
});

// ── API helpers ─────────────────────────────────────────────────
async function api(path, opts = {}) {
  const url = API + path;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'API error');
  }
  return res.json();
}

// ── Toast ───────────────────────────────────────────────────────
let _toastTimer;
function toast(msg, isErr = false) {
  const el = document.getElementById('alert-box');
  el.textContent = msg;
  el.className = isErr ? 'err' : '';
  el.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

// ── Navigation ──────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
  const sec = document.getElementById('view-' + name);
  if (sec) sec.classList.remove('hidden');

  if (name === 'dashboard') loadMyGroups();
}

function goHome() {
  if (travellerId) showView('dashboard');
  else showView('signup');
}

function updateNav() {
  const nu = document.getElementById('nav-user');
  nu.classList.remove('hidden');
  document.getElementById('nav-name').textContent = userName || '';
  document.getElementById('nav-traveller-id').textContent = travellerId;
}

function logout() {
  localStorage.removeItem('travellerId');
  localStorage.removeItem('userName');
  travellerId = null;
  userName = null;
  document.getElementById('nav-user').classList.add('hidden');
  showView('signup');
}

// ── Load interests & destinations ───────────────────────────────
async function loadInterests() {
  try {
    const data = await api('/interests');
    allInterests = data.interests || [];
  } catch {
    // fallback hardcoded
    allInterests = [
      {interest:'TEMPLES',label:'Temples and shrines'},{interest:'MUSEUMS',label:'Museums and galleries'},
      {interest:'HISTORY',label:'History and old towns'},{interest:'STREET_FOOD',label:'Street food and markets'},
      {interest:'FINE_DINING',label:'Fine dining'},{interest:'NIGHTLIFE',label:'Nightlife'},
      {interest:'SHOPPING',label:'Shopping'},{interest:'PHOTOGRAPHY',label:'Photography'},
      {interest:'HIKING',label:'Hiking'},{interest:'NATURE',label:'Parks and gardens'},
      {interest:'BEACHES',label:'Beaches'},{interest:'DESERT',label:'Desert trips'},
      {interest:'ADVENTURE',label:'Adventure sports'},{interest:'THEME_PARKS',label:'Theme parks'},
      {interest:'BUDGET_STAYS',label:'Budget stays'},{interest:'LUXURY',label:'Luxury stays'}
    ];
  }
  renderChips('su-chips', allInterests, 'su');
  renderChips('sg-chips', allInterests, 'sg');
}

async function loadDestinations() {
  try {
    const data = await api('/destinations');
    allDestinations = data.destinations || [];
  } catch {
    allDestinations = [
      {name:'Tokyo',country:'Japan'},{name:'Kyoto',country:'Japan'},{name:'Osaka',country:'Japan'},
      {name:'Dubai',country:'United Arab Emirates'},{name:'Abu Dhabi',country:'United Arab Emirates'}
    ];
  }
  document.querySelectorAll('select.city').forEach(sel => {
    sel.innerHTML = '';
    allDestinations.forEach(d => {
      const o = document.createElement('option');
      o.value = d.name;
      o.textContent = d.name + ' (' + d.country + ')';
      sel.appendChild(o);
    });
    // re-enhance custom dropdown
    if (typeof enhanceSelect === 'function') enhanceSelect(sel);
  });
}

// ── Chips renderer ──────────────────────────────────────────────
function renderChips(containerId, interests, prefix) {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = '';
  interests.forEach(int => {
    const lbl = document.createElement('label');
    lbl.className = 'chip';
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.name = prefix + '-interest';
    inp.value = int.interest;
    const sp = document.createElement('span');
    sp.textContent = int.label;
    lbl.appendChild(inp);
    lbl.appendChild(sp);
    c.appendChild(lbl);
  });
}

function getChecked(prefix) {
  return [...document.querySelectorAll(`input[name="${prefix}-interest"]:checked`)].map(c => c.value);
}

// ── Tabs ────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    t.parentElement.querySelectorAll('.tab').forEach(b => b.classList.remove('on'));
    t.classList.add('on');
    const tab = t.dataset.tab;
    document.getElementById('search-form').classList.toggle('hidden', tab !== 'search');
    document.getElementById('create-form').classList.toggle('hidden', tab !== 'create');
    if (tab === 'search') document.getElementById('search-results').classList.add('hidden');
  });
});

// ═══════════════════════════════════════════════════════════════
//   SIGNUP
// ═══════════════════════════════════════════════════════════════
document.getElementById('signup-form').addEventListener('submit', async e => {
  e.preventDefault();
  const interests = getChecked('su');
  if (interests.length < 2) return toast('Pick at least 2 interests', true);

  const payload = {
    name: document.getElementById('su-name').value.trim(),
    gender: document.getElementById('su-gender').value,
    home_city: document.getElementById('su-city').value,
    gender_preference: document.getElementById('su-pref').value,
    interests
  };

  try {
    const res = await api('/users/signup', { method: 'POST', body: JSON.stringify(payload) });
    travellerId = res.traveller_id;
    userName = payload.name;
    localStorage.setItem('travellerId', travellerId);
    localStorage.setItem('userName', userName);
    updateNav();
    toast('Welcome, ' + userName + '! Your ID: ' + travellerId);
    showView('dashboard');
  } catch (err) {
    toast(err.message, true);
  }
});

// ═══════════════════════════════════════════════════════════════
//   DASHBOARD — My Groups
// ═══════════════════════════════════════════════════════════════
async function loadMyGroups() {
  if (!travellerId) return;
  try {
    const data = await api('/users/' + travellerId + '/groups');
    const groups = data.groups || [];
    const section = document.getElementById('my-groups-section');
    const grid = document.getElementById('my-groups-grid');

    if (groups.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    grid.innerHTML = '';
    pendingCounts = {};

    // Fetch pending counts for owned groups in parallel
    const ownedGroups = groups.filter(g => g.role === 'owner');
    const pendingPromises = ownedGroups.map(g =>
      api('/groups/' + g.group_id + '/requests')
        .then(r => { pendingCounts[g.group_id] = (r.requests || []).length; })
        .catch(() => { pendingCounts[g.group_id] = 0; })
    );
    await Promise.all(pendingPromises);

    groups.forEach(g => {
      const card = document.createElement('div');
      card.className = 'glass group-card';
      const pending = pendingCounts[g.group_id] || 0;

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:start">
          <h3>${esc(g.name)}</h3>
          <span class="role-pill ${g.role}">${g.role}</span>
        </div>
        <p class="meta">📍 ${esc(g.city)} · ${g.check_in} → ${g.check_out}</p>
        <p class="meta">👥 ${g.member_count} / ${g.max_size} members · ₹${fmt(g.budget_inr)}</p>
        <div class="group-card-footer">
          <span class="tag">${g.is_locked ? '🔒 Locked' : '🟢 Open'}</span>
          ${g.role === 'owner' && pending > 0
            ? `<span class="badge" title="${pending} pending request(s)">${pending}</span>`
            : ''}
        </div>
      `;

      card.addEventListener('click', () => {
        if (g.role === 'owner' && pending > 0) {
          openManageRequests(g.group_id, g.name);
        } else {
          openWorkspace(g.group_id);
        }
      });
      grid.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to load groups:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
//   SEARCH
// ═══════════════════════════════════════════════════════════════
document.getElementById('search-form').addEventListener('submit', async e => {
  e.preventDefault();
  const interests = getChecked('sg');
  if (interests.length < 2) return toast('Pick at least 2 interests', true);

  const payload = {
    traveller_id: travellerId,
    city: document.getElementById('sg-city').value,
    check_in: document.getElementById('sg-in').value,
    check_out: document.getElementById('sg-out').value,
    budget_inr: +document.getElementById('sg-budget').value,
    interests
  };

  try {
    const data = await api('/search', { method: 'POST', body: JSON.stringify(payload) });
    renderSearchResults(data.matches || []);
  } catch (err) {
    toast(err.message, true);
  }
});

function renderSearchResults(matches) {
  const wrap = document.getElementById('search-results');
  const container = document.getElementById('results-container');
  wrap.classList.remove('hidden');
  container.innerHTML = '';

  if (matches.length === 0) {
    container.innerHTML = '<div class="glass empty">No matching groups found. Try adjusting your criteria or create your own group!</div>';
    return;
  }

  matches.forEach(m => {
    const card = document.createElement('div');
    card.className = 'glass card';

    // Calculate a visual match score based on shared interests & nights
    const matchScore = Math.min(99, m.shared_interests_count * 15 + m.shared_nights * 8);

    card.innerHTML = `
      <div class="thumb">
        <span>${esc(m.city)}</span>
      </div>
      <div>
        <h3>${esc(m.name)}</h3>
        <p class="meta">by ${esc(m.owner_name)} · ${esc(m.dates)}</p>
        <p class="meta">👥 ${m.member_count} / ${m.max_size} members</p>
        <span class="tag">${m.shared_interests_count} shared interests</span>
        <span class="tag o">${m.shared_nights} overlapping nights</span>
      </div>
      <div style="text-align:center">
        <div class="score">${matchScore}%</div>
        <p class="meta" style="margin-top:6px">match</p>
      </div>
    `;

    card.addEventListener('click', () => openGroupDetail(m));
    container.appendChild(card);
  });
}

// ═══════════════════════════════════════════════════════════════
//   CREATE GROUP
// ═══════════════════════════════════════════════════════════════
document.getElementById('create-form').addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    owner_id: travellerId,
    name: document.getElementById('cg-name').value.trim(),
    city: document.getElementById('cg-city').value,
    check_in: document.getElementById('cg-in').value,
    check_out: document.getElementById('cg-out').value,
    max_size: +document.getElementById('cg-size').value,
    budget_inr: +document.getElementById('cg-budget').value,
    itinerary: document.getElementById('cg-itinerary').value.trim()
  };

  try {
    const res = await api('/groups', { method: 'POST', body: JSON.stringify(payload) });
    toast('Group created! ID: ' + res.group_id);
    document.getElementById('create-form').reset();
    loadMyGroups();
  } catch (err) {
    toast(err.message, true);
  }
});

// ═══════════════════════════════════════════════════════════════
//   GROUP DETAIL (for seekers)
// ═══════════════════════════════════════════════════════════════
async function openGroupDetail(match) {
  currentGroupId = match.group_id;

  document.getElementById('gd-name').textContent = match.name;
  document.getElementById('gd-owner-info').textContent = 'Created by ' + match.owner_name;
  document.getElementById('gd-city').textContent = match.city;
  document.getElementById('gd-dates').textContent = match.dates;
  document.getElementById('gd-members-count').textContent = match.member_count + ' / ' + match.max_size;

  // Try to load full workspace data for budget & itinerary
  try {
    const ws = await api('/groups/' + match.group_id + '/workspace');
    const group = ws.group;
    document.getElementById('gd-budget').textContent = '₹' + fmt(group.budget_inr);
    document.getElementById('gd-itinerary').textContent = group.itinerary || 'No itinerary provided';

    // Render members
    const membersList = document.getElementById('gd-members-list');
    membersList.innerHTML = '';
    (ws.members || []).forEach(m => {
      const av = document.createElement('div');
      av.className = 'av';
      av.innerHTML = `<i>${esc(m.name[0])}</i>${esc(m.name)}`;
      membersList.appendChild(av);
    });
  } catch {
    document.getElementById('gd-budget').textContent = '—';
    document.getElementById('gd-itinerary').textContent = 'Loading…';
    document.getElementById('gd-members-list').innerHTML = '';
  }

  // Match badges
  const badges = document.getElementById('gd-match-badges');
  badges.innerHTML = '';
  if (match.shared_interests_count) {
    badges.innerHTML += `<span class="tag">${match.shared_interests_count} shared interests</span>`;
  }
  if (match.shared_nights) {
    badges.innerHTML += `<span class="tag o">${match.shared_nights} overlapping nights</span>`;
  }

  // Action area
  const actionArea = document.getElementById('gd-action-area');
  if (match.member_count >= match.max_size) {
    actionArea.innerHTML = '<button class="btn full" disabled>Group Full</button>';
  } else {
    actionArea.innerHTML = '<button class="btn btn-sage full" id="btn-express-interest">Express Interest</button>';
    document.getElementById('btn-express-interest').addEventListener('click', () => expressInterest(match.group_id));
  }

  showView('group-detail');
}

async function expressInterest(groupId) {
  const btn = document.getElementById('btn-express-interest');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    await api('/groups/' + groupId + '/join', {
      method: 'POST',
      body: JSON.stringify({ traveller_id: travellerId })
    });
    toast('Interest sent! The group owner will review your request.');
    btn.textContent = 'Request Pending ⏳';
    btn.classList.remove('btn-sage');
    btn.classList.add('btn-outline');
  } catch (err) {
    if (err.message.includes('already')) {
      btn.textContent = 'Request Pending ⏳';
      btn.classList.remove('btn-sage');
      btn.classList.add('btn-outline');
      toast('You already have a pending request for this group');
    } else {
      btn.disabled = false;
      btn.textContent = 'Express Interest';
      toast(err.message, true);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//   MANAGE REQUESTS (for group owners)
// ═══════════════════════════════════════════════════════════════
async function openManageRequests(groupId, groupName) {
  currentGroupId = groupId;
  document.getElementById('mr-title').textContent = 'Pending Requests';
  document.getElementById('mr-subtitle').textContent = 'for ' + (groupName || groupId);
  showView('manage-requests');

  const list = document.getElementById('mr-requests-list');
  list.innerHTML = '<p class="empty">Loading…</p>';

  try {
    const data = await api('/groups/' + groupId + '/requests');
    const requests = data.requests || [];

    if (requests.length === 0) {
      list.innerHTML = '<div class="glass empty">No pending requests 🎉</div>';
      return;
    }

    list.innerHTML = '';
    requests.forEach(r => {
      const card = document.createElement('div');
      card.className = 'glass request-card';
      card.id = 'req-' + r.request_id;
      const profile = r.profile || {};
      const interests = (profile.interests || []).map(i => {
        const found = allInterests.find(a => a.interest === i);
        return found ? found.label : i;
      });

      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px">
          <div class="av"><i>${esc((profile.name || '?')[0])}</i></div>
          <div>
            <h3>${esc(profile.name || 'Unknown')}</h3>
            <p class="meta">${esc(profile.home_city || '')} · ${esc(profile.gender || '')}</p>
          </div>
        </div>
        <div class="chips" style="margin-top:12px">
          ${interests.map(i => `<span class="chip"><span style="padding:6px 14px;font-size:.85rem">${esc(i)}</span></span>`).join('')}
        </div>
        <div class="request-actions">
          <button class="btn btn-sage sm" onclick="approveRequest('${groupId}','${r.request_id}')">✓ Approve</button>
          <button class="btn btn-danger sm" onclick="declineRequest('${groupId}','${r.request_id}')">✗ Decline</button>
        </div>
      `;
      list.appendChild(card);
    });
  } catch (err) {
    list.innerHTML = `<div class="glass empty" style="color:var(--clay-d)">${esc(err.message)}</div>`;
  }
}

async function approveRequest(groupId, requestId) {
  try {
    await api('/groups/' + groupId + '/requests/' + requestId + '/approve', { method: 'POST' });
    toast('Request approved!');
    const card = document.getElementById('req-' + requestId);
    if (card) {
      card.style.opacity = '.4';
      card.innerHTML = '<p style="text-align:center;padding:12px;font-weight:700;color:var(--sage-d)">✓ Approved</p>';
    }
  } catch (err) {
    toast(err.message, true);
  }
}

async function declineRequest(groupId, requestId) {
  try {
    await api('/groups/' + groupId + '/requests/' + requestId + '/decline', { method: 'POST' });
    toast('Request declined');
    const card = document.getElementById('req-' + requestId);
    if (card) {
      card.style.opacity = '.4';
      card.innerHTML = '<p style="text-align:center;padding:12px;font-weight:700;color:var(--clay-d)">✗ Declined</p>';
    }
  } catch (err) {
    toast(err.message, true);
  }
}

// ═══════════════════════════════════════════════════════════════
//   WORKSPACE
// ═══════════════════════════════════════════════════════════════
async function openWorkspace(groupId) {
  currentGroupId = groupId;
  showView('workspace');

  // Reset
  document.getElementById('ws-booking-banner').classList.add('hidden');
  document.getElementById('ws-lock-area').classList.remove('hidden');
  document.getElementById('ws-hotels-container').innerHTML = '<p class="empty">Loading hotels…</p>';

  try {
    const ws = await api('/groups/' + groupId + '/workspace');
    const group = ws.group;
    const members = ws.members || [];
    currentGroupData = group;

    document.getElementById('ws-group-name').textContent = group.name;
    document.getElementById('ws-group-details').textContent =
      '📍 ' + group.city + ' · ' + group.check_in + ' → ' + group.check_out + ' · ₹' + fmt(group.budget_inr);

    document.getElementById('ws-member-count').textContent = members.length;
    document.getElementById('ws-max-size').textContent = group.max_size;
    document.getElementById('ws-bar').style.width = Math.round(members.length / group.max_size * 100) + '%';

    // Members
    const ml = document.getElementById('ws-members-list');
    ml.innerHTML = '';
    members.forEach(m => {
      const av = document.createElement('div');
      av.className = 'av';
      const interests = (m.interests || []).map(i => {
        const found = allInterests.find(a => a.interest === i);
        return found ? found.label : i;
      }).slice(0, 3).join(', ');
      av.innerHTML = `<i>${esc(m.name[0])}</i>${esc(m.name)}`;
      av.title = interests;
      ml.appendChild(av);
    });

    // Check if booking is locked
    if (group.is_locked) {
      showBookingConfirmation(group);
    }

    // Load hotels
    loadHotels(groupId);
  } catch (err) {
    toast(err.message, true);
  }
}

async function loadHotels(groupId) {
  const container = document.getElementById('ws-hotels-container');
  try {
    const data = await api('/groups/' + groupId + '/hotels');
    const options = data.options || [];

    if (options.length === 0) {
      container.innerHTML = '<div class="glass empty">No hotels available for these dates. Try different dates.</div>';
      return;
    }

    // Load shortlist from localStorage
    const shortlist = getShortlist(groupId);
    container.innerHTML = '';

    options.forEach(h => {
      const card = document.createElement('div');
      card.className = 'glass hotel-card';
      const isShortlisted = shortlist.includes(h.hotel_name + '|' + h.room_name);
      const imgPath = h.image ? ('/' + h.image) : '';
      const starsStr = '★'.repeat(h.stars || 0) + '☆'.repeat(5 - (h.stars || 0));

      card.innerHTML = `
        <div class="hotel-card-inner">
          <div>
            ${imgPath
              ? `<img class="hotel-img" src="${imgPath}" alt="${esc(h.hotel_name)}" onerror="this.style.display='none'">`
              : `<div class="hotel-img" style="background:linear-gradient(135deg,#9db5a0,var(--sage));display:grid;place-items:center;color:#fff;font-weight:800;font-size:1.5rem;border-radius:22px">${esc(h.hotel_name[0])}</div>`
            }
          </div>
          <div class="hotel-info">
            <h3>${esc(h.hotel_name)}</h3>
            <p class="meta">${esc(h.room_name)} · ${esc(h.area || '')}</p>
            <div class="hotel-stars">${starsStr}</div>
            <p class="meta">Rating: ${h.rating}/10</p>
          </div>
          <div class="hotel-pricing">
            <div class="per-person">₹${fmt(h.per_person_inr)}</div>
            <div class="total">per person</div>
            <div class="meta" style="margin-top:4px">Total: ₹${fmt(h.total_cost_inr)}</div>
            <div class="hotel-actions">
              <button class="star-btn ${isShortlisted ? 'active' : ''}" onclick="toggleShortlist(this, '${groupId}','${esc(h.hotel_name)}','${esc(h.room_name)}')" title="Shortlist">
                ${isShortlisted ? '★' : '☆'}
              </button>
              <button class="btn sm" onclick="selectHotelForBooking('${esc(h.hotel_name)}','${esc(h.room_name)}',${h.per_person_inr},${h.total_cost_inr})">Select</button>
            </div>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = `<div class="glass empty" style="color:var(--clay-d)">${esc(err.message)}</div>`;
  }
}

// ── Shortlist (localStorage) ────────────────────────────────────
function getShortlist(groupId) {
  try {
    return JSON.parse(localStorage.getItem('shortlist_' + groupId) || '[]');
  } catch { return []; }
}

function toggleShortlist(btn, groupId, hotelName, roomName) {
  const key = hotelName + '|' + roomName;
  let list = getShortlist(groupId);
  if (list.includes(key)) {
    list = list.filter(k => k !== key);
    btn.classList.remove('active');
    btn.textContent = '☆';
    toast('Removed from shortlist');
  } else {
    list.push(key);
    btn.classList.add('active');
    btn.textContent = '★';
    toast('Added to shortlist ⭐');
  }
  localStorage.setItem('shortlist_' + groupId, JSON.stringify(list));
}

// ── Booking ─────────────────────────────────────────────────────
function selectHotelForBooking(hotelName, roomName, perPerson, total) {
  selectedHotel = { hotel_name: hotelName, room_name: roomName, per_person: perPerson, total: total };
  document.getElementById('modal-hotel-name').textContent = hotelName;
  document.getElementById('modal-room-name').textContent = roomName;
  document.getElementById('modal-cost-info').textContent = '₹' + fmt(perPerson) + ' per person · Total: ₹' + fmt(total);
  document.getElementById('modal-selected-hotel').classList.remove('hidden');
  showBookingModal();
}

function showBookingModal() {
  if (!selectedHotel) {
    document.getElementById('modal-selected-hotel').classList.add('hidden');
    document.getElementById('modal-hotel-info').textContent = 'Are you sure you want to lock this booking for the group?';
  }
  document.getElementById('booking-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('booking-modal').classList.add('hidden');
}

function closeModalOutside(e) {
  if (e.target.id === 'booking-modal') closeModal();
}

async function confirmBooking() {
  closeModal();
  try {
    const body = selectedHotel
      ? { hotel_name: selectedHotel.hotel_name, room_name: selectedHotel.room_name }
      : {};
    const res = await api('/groups/' + currentGroupId + '/book', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    toast('Booking locked! Ref: ' + res.booking_id);

    // Update the current group data
    if (currentGroupData) {
      currentGroupData.is_locked = 1;
      currentGroupData.booked_hotel = selectedHotel ? selectedHotel.hotel_name : null;
      currentGroupData.booked_room = selectedHotel ? selectedHotel.room_name : null;
    }

    showBookingConfirmation({
      ...currentGroupData,
      booking_id: res.booking_id,
      booked_hotel: selectedHotel ? selectedHotel.hotel_name : null,
      booked_room: selectedHotel ? selectedHotel.room_name : null
    });
  } catch (err) {
    toast(err.message, true);
  }
}

function showBookingConfirmation(group) {
  const banner = document.getElementById('ws-booking-banner');
  const bookingId = group.booking_id || 'BKG-' + group.group_id;
  banner.classList.remove('hidden');
  banner.innerHTML = `
    <h2>🎉 Booking Confirmed!</h2>
    <p>Your group trip is locked in. Share this reference with your group.</p>
    <div class="booking-ref">${esc(bookingId)}</div>
    <div class="booking-details">
      ${group.booked_hotel ? `<span>🏨 ${esc(group.booked_hotel)}</span>` : ''}
      ${group.booked_room ? `<span>🛏️ ${esc(group.booked_room)}</span>` : ''}
      <span>📍 ${esc(group.city)}</span>
      <span>📅 ${group.check_in} → ${group.check_out}</span>
    </div>
  `;

  // Hide the lock button
  document.getElementById('ws-lock-area').innerHTML =
    '<span class="tag" style="font-size:1rem;padding:10px 22px">🔒 Booking Locked</span>';
}

// ═══════════════════════════════════════════════════════════════
//   UTILITIES
// ═══════════════════════════════════════════════════════════════
function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function fmt(n) {
  return Number(n).toLocaleString('en-IN');
}
