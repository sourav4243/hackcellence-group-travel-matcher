/* ═══════════════════════════════════════════════════════════════
   Travel Matcher – Single-Page App (app.js)
   ═══════════════════════════════════════════════════════════════ */

const API = 'http://localhost:8000/api';

// City image mapping from real local image catalog
const CITY_IMAGES = {
  'Tokyo': 'images/hotels/HOTEL-TWIN-1.jpg',
  'Kyoto': 'images/hotels/HOTEL-RYOKAN-1.jpg',
  'Osaka': 'images/hotels/HOTEL-BUSINESS-2.jpg',
  'Dubai': 'images/hotels/HOTEL-LUXURY-1.jpg',
  'Abu Dhabi': 'images/hotels/HOTEL-FAMILY-1.jpg'
};

function getImageUrl(relPath) {
  if (!relPath) return '';
  const base = API.replace('/api', '');
  return relPath.startsWith('/') ? `${base}${relPath}` : `${base}/${relPath}`;
}

// ── State ───────────────────────────────────────────────────────
let travellerId = localStorage.getItem('travellerId') || null;
let userName    = localStorage.getItem('userName') || null;
let allInterests = [];
let allDestinations = [];
let existingUsers = [];
let currentGroupId = null;   // group being viewed in detail / workspace
let currentGroupData = null; // cached group detail for booking
let selectedHotel = null;    // hotel selected for booking
let pendingCounts = {};      // groupId → pending request count

// ── Boot ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupDateInputs();
  await loadInterests();
  await loadDestinations();
  await loadExistingUsers();

  if (travellerId) {
    updateNav();
    showView('dashboard');
    const u = existingUsers.find(x => x.traveller_id === travellerId);
    if (u) syncUserPreferences(u);
    else api('/users/' + travellerId).then(res => { if (res.user) syncUserPreferences(res.user); }).catch(() => {});
  } else {
    showView('signup');
  }
});

// ── Date accessibility & dataset constraint (2027-04-01 to 2027-04-20) ─
function setupDateInputs() {
  const minDate = "2027-04-01";
  const maxDate = "2027-04-20";
  const defaultIn = "2027-04-10";
  const defaultOut = "2027-04-15";

  ['sg', 'cg'].forEach(prefix => {
    const checkIn = document.getElementById(prefix + '-in');
    const checkOut = document.getElementById(prefix + '-out');
    if (checkIn && checkOut) {
      checkIn.min = minDate;
      checkIn.max = maxDate;
      checkOut.min = minDate;
      checkOut.max = maxDate;

      if (!checkIn.value) checkIn.value = defaultIn;
      if (!checkOut.value) checkOut.value = defaultOut;

      checkIn.addEventListener('change', () => {
        if (checkIn.value) {
          checkOut.min = checkIn.value;
          if (checkOut.value && checkOut.value <= checkIn.value) {
            const nextDay = new Date(new Date(checkIn.value).getTime() + 86400000).toISOString().split('T')[0];
            checkOut.value = nextDay <= maxDate ? nextDay : maxDate;
          }
        }
      });
    }
  });
}

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
  _toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
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

// ── Load interests & destinations from backend ──────────────────
async function loadInterests() {
  try {
    const data = await api('/interests');
    allInterests = data.interests || [];
  } catch {
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
  // Render chips on Signup profile, Search (join), and Create
  renderChips('su-chips', allInterests, 'su');
  renderChips('sg-chips', allInterests, 'sg');
  renderChips('cg-chips', allInterests, 'cg');
}

async function loadDestinations() {
  try {
    const data = await api('/destinations');
    allDestinations = data.destinations || [];
    const departureCities = data.departure_cities || ['Bengaluru', 'Delhi', 'Mumbai', 'Chennai'];

    // Dynamically populate home departure cities from backend data
    const homeSel = document.getElementById('su-city');
    if (homeSel) {
      homeSel.innerHTML = '';
      departureCities.forEach(c => {
        const o = document.createElement('option');
        o.value = c;
        o.textContent = c;
        homeSel.appendChild(o);
      });
      if (typeof enhanceSelect === 'function') enhanceSelect(homeSel);
      else if (typeof window.enhanceSelect === 'function') window.enhanceSelect(homeSel);
    }
  } catch {
    allDestinations = [
      {name:'Tokyo',country:'Japan'},{name:'Kyoto',country:'Japan'},{name:'Osaka',country:'Japan'},
      {name:'Dubai',country:'United Arab Emirates'},{name:'Abu Dhabi',country:'United Arab Emirates'}
    ];
  }

  // Populate destination city dropdowns
  document.querySelectorAll('select.city').forEach(sel => {
    sel.innerHTML = '';
    allDestinations.forEach(d => {
      const o = document.createElement('option');
      o.value = d.name;
      o.textContent = d.name + ' (' + d.country + ')';
      sel.appendChild(o);
    });
    sel.selectedIndex = 0;
    if (typeof enhanceSelect === 'function') enhanceSelect(sel);
    else if (typeof window.enhanceSelect === 'function') window.enhanceSelect(sel);
  });
}

// ── Load 24 existing travellers from database for login dropdown ─
async function loadExistingUsers() {
  const sel = document.getElementById('login-user-select');
  const preview = document.getElementById('login-user-preview');
  if (!sel) return;

  try {
    const data = await api('/users');
    existingUsers = data.users || [];
    sel.innerHTML = '';

    if (existingUsers.length === 0) {
      sel.innerHTML = '<option value="">No existing users found</option>';
      return;
    }

    existingUsers.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.traveller_id;
      opt.textContent = `${u.name} (${u.traveller_id} · ${u.home_city})`;
      sel.appendChild(opt);
    });

    function updatePreview() {
      const user = existingUsers.find(u => u.traveller_id === sel.value);
      if (user && preview) {
        const intLabels = (user.interests || []).map(code => {
          const found = allInterests.find(i => i.interest === code);
          return found ? found.label : code;
        });
        preview.textContent = intLabels.length
          ? `🌟 Interests: ${intLabels.join(', ')}`
          : 'No interests listed';
      }
    }

    sel.addEventListener('change', updatePreview);
    updatePreview();

    if (typeof enhanceSelect === 'function') enhanceSelect(sel);
    else if (typeof window.enhanceSelect === 'function') window.enhanceSelect(sel);
  } catch (err) {
    console.error('Failed to load existing users:', err);
    if (preview) preview.textContent = 'Could not load existing travellers';
  }
}

// Log in as an existing user from the dropdown
function loginExistingUser() {
  const sel = document.getElementById('login-user-select');
  if (!sel || !sel.value) return toast('Please select a traveller to log in', true);

  const user = existingUsers.find(u => u.traveller_id === sel.value);
  if (!user) return toast('Traveller not found', true);

  travellerId = user.traveller_id;
  userName = user.name;
  localStorage.setItem('travellerId', travellerId);
  localStorage.setItem('userName', userName);
  updateNav();
  syncUserPreferences(user);
  toast(`Welcome back, ${userName}! Logged in as ${travellerId}`);
  showView('dashboard');
}

// Sync user's stored preferences & interests into search inputs
function syncUserPreferences(user) {
  if (!user) return;
  const userInterests = user.interests || [];
  renderChips('sg-chips', allInterests, 'sg', userInterests);
  renderChips('su-chips', allInterests, 'su', userInterests);

  const suCity = document.getElementById('su-city');
  if (suCity && user.home_city) suCity.value = user.home_city;
  const suGender = document.getElementById('su-gender');
  if (suGender && user.gender) suGender.value = user.gender;
  const suPref = document.getElementById('su-pref');
  if (suPref && user.gender_preference) suPref.value = user.gender_preference;
}

// ── Chips renderer ──────────────────────────────────────────────
function renderChips(containerId, interests, prefix, preChecked = []) {
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
    if (preChecked.includes(int.interest)) {
      inp.checked = true;
    }
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

// Save interests to user profile
async function saveUserInterests(interests) {
  if (!travellerId || !interests || !interests.length) return;
  try {
    await api('/users/' + travellerId + '/interests', {
      method: 'POST',
      body: JSON.stringify({ interests })
    });
  } catch (err) {
    console.error('Failed to update interests:', err);
  }
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
//   SIGNUP (Create new profile with interests)
// ═══════════════════════════════════════════════════════════════
document.getElementById('signup-form').addEventListener('submit', async e => {
  e.preventDefault();

  const interests = getChecked('su');
  if (interests.length < 2) return toast('Pick at least 2 interests for your profile', true);

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
        <div style="display:flex;gap:14px;align-items:center;margin-bottom:12px">
          <div style="width:52px;height:52px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(135deg,var(--sage),var(--clay));color:#fff;font-size:1.6rem;flex-shrink:0;box-shadow:0 4px 12px rgba(107,143,113,.25)">
            👥
          </div>
          <div style="flex:1;min-width:0">
            <h3 style="margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.name)}</h3>
            <span class="role-pill ${g.role}">${g.role}</span>
          </div>
        </div>
        <p class="meta">📍 ${esc(g.city)} · ${g.check_in} → ${g.check_out}</p>
        <p class="meta">👥 ${g.member_count} / ${g.max_size} members · ₹${fmt(g.budget_inr)}</p>
        <div class="group-card-footer" style="margin-top:14px;display:flex;justify-content:space-between;align-items:center">
          <span class="tag">${g.is_locked ? '🔒 Locked' : '🟢 Open'}</span>
          ${g.role === 'owner' && pending > 0
            ? `<span class="badge" style="background:#e04040;color:#fff;padding:6px 12px;border-radius:999px;font-weight:800;font-size:.85rem;box-shadow:0 2px 8px rgba(224,64,64,.35)">🔔 ${pending} Pending Request${pending > 1 ? 's' : ''}</span>`
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
//   SEARCH (Join flow: pick interests & search matching groups)
// ═══════════════════════════════════════════════════════════════
document.getElementById('search-form').addEventListener('submit', async e => {
  e.preventDefault();
  const interests = getChecked('sg');
  if (interests.length < 2) return toast('Pick at least 2 interests to find matching groups', true);

  const checkIn = document.getElementById('sg-in').value;
  const checkOut = document.getElementById('sg-out').value;
  if (checkOut <= checkIn) {
    return toast('Check-out date must be after check-in date', true);
  }

  // Constrain to available dataset window
  if (checkIn < '2027-04-01' || checkOut > '2027-04-20') {
    return toast('Dates must be within the available travel window (2027-04-01 to 2027-04-20)', true);
  }

  // Persist seeker's interests
  saveUserInterests(interests);

  const payload = {
    traveller_id: travellerId,
    city: document.getElementById('sg-city').value,
    check_in: checkIn,
    check_out: checkOut,
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
    const score = m.match_score || 95;

    card.innerHTML = `
      <div class="thumb" style="display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(107,143,113,.18),rgba(199,122,87,.18));border-radius:24px;border:1px solid rgba(107,143,113,.3);text-align:center;padding:12px">
        <span style="font-size:2.2rem;line-height:1">👥</span>
        <span style="font-size:.85rem;font-weight:800;color:var(--ink);margin-top:8px">${esc(m.city)}</span>
      </div>
      <div>
        <h3 style="margin-bottom:4px">${esc(m.name)}</h3>
        <p class="meta">Hosted by <b>${esc(m.owner_name)}</b> (${esc(m.owner_gender ? m.owner_gender.toLowerCase() : '')}) · 📅 ${esc(m.dates)}</p>
        <p class="meta">👥 ${m.member_count} / ${m.max_size} members · ₹${fmt(m.budget_inr)} budget</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          <span class="tag" style="background:rgba(107,143,113,.15);color:var(--sage-d);font-weight:700">🎯 ${m.shared_interests_count} Shared: ${(m.shared_interest_names || []).join(', ')}</span>
          <span class="tag o" style="font-weight:700">📅 ${m.shared_nights} Nights Overlap</span>
          <span class="tag" style="background:rgba(199,122,87,.15);color:var(--clay-d);font-weight:700">💰 ₹${fmt(m.budget_inr)} (within ${m.budget_variance_pct}% budget)</span>
          <span class="tag" style="background:#edf2ed;color:var(--ink);font-weight:600">🛡️ ${esc(m.owner_gender || '')} Only</span>
        </div>
      </div>
      <div style="text-align:center;min-width:90px;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div class="score">${score}%</div>
        <p class="meta" style="font-weight:800;color:var(--sage-d);margin-top:4px;letter-spacing:.03em">BEST FIT</p>
      </div>
    `;

    card.addEventListener('click', () => openGroupDetail(m));
    container.appendChild(card);
  });
}

// ═══════════════════════════════════════════════════════════════
//   CREATE GROUP (with interests & constrained travel dates)
// ═══════════════════════════════════════════════════════════════
document.getElementById('create-form').addEventListener('submit', async e => {
  e.preventDefault();

  const interests = getChecked('cg');
  if (interests.length < 2) return toast('Pick at least 2 interests for your group', true);

  const checkIn = document.getElementById('cg-in').value;
  const checkOut = document.getElementById('cg-out').value;
  if (checkOut <= checkIn) {
    return toast('Check-out date must be after check-in date', true);
  }

  if (checkIn < '2027-04-01' || checkOut > '2027-04-20') {
    return toast('Dates must be within the available travel window (2027-04-01 to 2027-04-20)', true);
  }

  const payload = {
    owner_id: travellerId,
    name: document.getElementById('cg-name').value.trim(),
    city: document.getElementById('cg-city').value,
    check_in: checkIn,
    check_out: checkOut,
    max_size: +document.getElementById('cg-size').value,
    budget_inr: +document.getElementById('cg-budget').value,
    itinerary: document.getElementById('cg-itinerary').value.trim(),
    interests
  };

  try {
    const res = await api('/groups', { method: 'POST', body: JSON.stringify(payload) });
    toast('Group created! ID: ' + res.group_id);
    document.getElementById('create-form').reset();
    setupDateInputs();
    renderChips('cg-chips', allInterests, 'cg');
    loadMyGroups();
    openWorkspace(res.group_id);
  } catch (err) {
    toast(err.message, true);
  }
});

// ═══════════════════════════════════════════════════════════════
//   GROUP DETAIL & JOIN PAGE (for seekers)
// ═══════════════════════════════════════════════════════════════
async function openGroupDetail(match) {
  currentGroupId = match.group_id;

  const avEl = document.getElementById('gd-avatar');
  if (avEl) avEl.textContent = '👥';

  document.getElementById('gd-name').textContent = match.name;
  document.getElementById('gd-owner-info').textContent = 'Created by ' + match.owner_name + (match.owner_gender ? ' (' + match.owner_gender.toLowerCase() + ')' : '');
  document.getElementById('gd-city').textContent = match.city;
  document.getElementById('gd-dates').textContent = match.dates;
  document.getElementById('gd-members-count').textContent = match.member_count + ' / ' + match.max_size;

  // Render match score explanation callout
  const expEl = document.getElementById('gd-match-explanation');
  if (expEl) {
    const reasons = match.match_reasons || [
      `${match.shared_interests_count} shared interests with host`,
      `${match.shared_nights} overlapping vacation nights`,
      `Budget within ${match.budget_variance_pct || 20}% variance`,
      `Safety & gender preferences fully compatible`
    ];
    expEl.innerHTML = `
      <div class="glass" style="margin:16px 0;padding:16px 20px;border-radius:20px;border-left:5px solid var(--sage);background:rgba(107,143,113,.08)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <strong style="color:var(--sage-d);font-size:1.05rem">🎯 Match Compatibility: ${match.match_score || 95}%</strong>
          <span class="tag" style="background:var(--sage);color:#fff;font-weight:700">Verified Fit</span>
        </div>
        <ul style="margin:0;padding-left:20px;font-size:.9rem;line-height:1.6;color:var(--ink)">
          ${reasons.map(r => `<li><b>${esc(r)}</b></li>`).join('')}
        </ul>
      </div>
    `;
  }

  const preChecked = getChecked('sg');
  renderChips('gd-chips', allInterests, 'gd', preChecked.length ? preChecked : (match.shared_interests || []));

  try {
    const ws = await api('/groups/' + match.group_id + '/workspace');
    const group = ws.group;
    document.getElementById('gd-budget').textContent = '₹' + fmt(group.budget_inr);
    document.getElementById('gd-itinerary').textContent = group.itinerary || 'No itinerary provided';

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

  const badges = document.getElementById('gd-match-badges');
  if (badges) {
    badges.innerHTML = '';
    if (match.shared_interests_count) {
      badges.innerHTML += `<span class="tag">🎯 ${match.shared_interests_count} shared interests: ${(match.shared_interest_names || []).join(', ')}</span>`;
    }
    if (match.shared_nights) {
      badges.innerHTML += `<span class="tag o">📅 ${match.shared_nights} overlapping nights</span>`;
    }
  }

  const actionArea = document.getElementById('gd-action-area');
  if (match.member_count >= match.max_size) {
    actionArea.innerHTML = '<button class="btn full" disabled>Group Full</button>';
  } else {
    actionArea.innerHTML = '<button class="btn btn-sage full" id="btn-express-interest">Join Group / Express Interest</button>';
    document.getElementById('btn-express-interest').addEventListener('click', () => expressInterest(match.group_id));
  }

  showView('group-detail');
}

async function expressInterest(groupId) {
  const btn = document.getElementById('btn-express-interest');
  if (!btn) return;

  const interests = getChecked('gd').length >= 2 ? getChecked('gd') : getChecked('sg');
  if (interests.length < 2) {
    return toast('Select at least 2 interests you bring to this group', true);
  }

  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    await api('/groups/' + groupId + '/join', {
      method: 'POST',
      body: JSON.stringify({ traveller_id: travellerId, interests })
    });
    toast('Interest sent! The group owner will review your request.');
    btn.textContent = 'Request Pending ⏳';
    btn.classList.remove('btn-sage');
    btn.classList.add('btn-outline');
  } catch (err) {
    if (err.message && err.message.includes('already')) {
      btn.textContent = 'Request Pending ⏳';
      btn.classList.remove('btn-sage');
      btn.classList.add('btn-outline');
      toast('You already have a pending request for this group');
    } else {
      btn.disabled = false;
      btn.textContent = 'Join Group / Express Interest';
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
    toast('✓ Seeker approved and added to group roster!');
    const card = document.getElementById('req-' + requestId);
    if (card) {
      card.style.background = 'rgba(107,143,113,.15)';
      card.style.borderColor = 'var(--sage)';
      card.innerHTML = '<div style="text-align:center;padding:16px;font-weight:800;color:var(--sage-d);font-size:1.05rem">✓ Approved & Added to Group Members</div>';
    }
    if (pendingCounts[groupId] && pendingCounts[groupId] > 0) {
      pendingCounts[groupId]--;
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
      card.style.background = 'rgba(199,122,87,.1)';
      card.style.borderColor = 'var(--clay)';
      card.innerHTML = '<div style="text-align:center;padding:16px;font-weight:800;color:var(--clay-d);font-size:1.05rem">✕ Request Declined</div>';
    }
    if (pendingCounts[groupId] && pendingCounts[groupId] > 0) {
      pendingCounts[groupId]--;
    }
  } catch (err) {
    toast(err.message, true);
  }
}

// ═══════════════════════════════════════════════════════════════
//   WORKSPACE (Group members, real hotels data & images)
// ═══════════════════════════════════════════════════════════════
async function openWorkspace(groupId) {
  currentGroupId = groupId;
  showView('workspace');

  document.getElementById('ws-booking-banner').classList.add('hidden');
  document.getElementById('ws-lock-area').classList.remove('hidden');
  document.getElementById('ws-hotels-container').innerHTML = '<p class="empty">Loading hotels…</p>';

  try {
    const ws = await api('/groups/' + groupId + '/workspace');
    const group = ws.group;
    const members = ws.members || [];
    currentGroupData = group;

    const isOwner = group.owner_id === travellerId;
    const roleBadge = document.getElementById('ws-role-badge');
    if (roleBadge) {
      roleBadge.textContent = isOwner ? 'owner' : 'member';
      roleBadge.className = 'role-pill ' + (isOwner ? 'owner' : 'member');
    }

    const btnEdit = document.getElementById('btn-edit-group');
    if (btnEdit) btnEdit.style.display = isOwner ? 'inline-block' : 'none';

    const btnDel = document.getElementById('btn-delete-group');
    if (btnDel) btnDel.style.display = isOwner ? 'inline-block' : 'none';

    document.getElementById('ws-group-name').textContent = group.name;
    document.getElementById('ws-group-details').textContent =
      '📍 ' + group.city + ' · ' + group.check_in + ' → ' + group.check_out + ' · ₹' + fmt(group.budget_inr);

    document.getElementById('ws-member-count').textContent = members.length;
    document.getElementById('ws-max-size').textContent = group.max_size;
    document.getElementById('ws-bar').style.width = Math.round(members.length / group.max_size * 100) + '%';

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

    if (group.is_locked) {
      showBookingConfirmation(group, isOwner);
    } else {
      document.getElementById('ws-lock-area').innerHTML =
        '<button id="btn-lock" class="btn sm" onclick="showBookingModal()">Lock booking</button>';
    }

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
      container.innerHTML = '<div class="glass empty">No hotels available for this destination on these dates.</div>';
      return;
    }

    const shortlist = getShortlist(groupId);
    container.innerHTML = '';

    options.forEach(h => {
      const card = document.createElement('div');
      card.className = 'glass hotel-card';
      const isShortlisted = shortlist.includes(h.hotel_name + '|' + h.room_name);
      const imgPath = h.image ? getImageUrl(h.image) : '';
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
            <h3 style="margin-bottom:4px">${esc(h.hotel_name)}</h3>
            <p class="meta"><b>${esc(h.room_name)}</b> · ${esc(h.area || '')}</p>
            <div class="hotel-stars" style="color:#d4a017;font-size:1.1rem;margin:4px 0">${starsStr}</div>
            <p class="meta">Guest Rating: <b>${h.rating} / 10</b></p>
            <div class="meta" style="margin-top:6px;font-size:.82rem;color:var(--mute)">
              ${h.req_rooms} room(s) for ${h.member_count} member(s) (${h.nights} nights)
            </div>
          </div>
          <div class="hotel-pricing">
            <div class="per-person" style="color:var(--sage-d)">₹${fmt(h.per_person_inr)}</div>
            <div class="total" style="font-weight:700">per person</div>
            <div class="meta" style="margin-top:6px;font-size:.84rem;background:rgba(31,42,36,.06);padding:8px 10px;border-radius:12px;line-height:1.4">
              <b>Live Cost Split:</b><br>
              ₹${fmt(h.total_cost_inr)} ÷ ${h.member_count} members<br>
              <span style="font-size:.76rem;color:var(--mute)">(@ ₹${fmt(h.price_per_night)}/nt × ${h.req_rooms} rm × ${h.nights} nt)</span>
            </div>
            <div class="hotel-actions" style="margin-top:10px">
              <button class="star-btn ${isShortlisted ? 'active' : ''}" onclick="toggleShortlist(this, '${groupId}','${esc(h.hotel_name)}','${esc(h.room_name)}')" title="Save to Shortlist">
                ${isShortlisted ? '★' : '☆'}
              </button>
              <button class="btn sm" onclick="selectHotelForBooking('${esc(h.hotel_name)}','${esc(h.room_name)}',${h.per_person_inr},${h.total_cost_inr},${h.member_count},${h.req_rooms},${h.nights})">Select & Book</button>
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
function selectHotelForBooking(hotelName, roomName, perPerson, total, memberCount, reqRooms, nights) {
  selectedHotel = { hotel_name: hotelName, room_name: roomName, per_person: perPerson, total: total, member_count: memberCount, req_rooms: reqRooms, nights: nights };
  document.getElementById('modal-hotel-name').textContent = hotelName;
  document.getElementById('modal-room-name').textContent = roomName;
  document.getElementById('modal-cost-info').innerHTML = `
    <b>Equal Split:</b> ₹${fmt(perPerson)} per person<br>
    <span style="font-size:.85rem;color:var(--mute)">Total Stay Cost: ₹${fmt(total)} ÷ ${memberCount || 1} members (${reqRooms || 1} room(s) × ${nights || 1} nights)</span>
  `;
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

function showBookingConfirmation(group, isOwner = false) {
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
    <div style="margin-top:16px">
      <button class="btn btn-outline sm" onclick="unlockGroup('${group.group_id}')" title="Unlock group to pick another stay or edit details">🔓 Unlock Group</button>
    </div>
  `;

  document.getElementById('ws-lock-area').innerHTML = `
    <span class="tag" style="font-size:.9rem;padding:6px 14px;background:rgba(107,143,113,.2);color:var(--sage-d);font-weight:700">🔒 Locked</span>
    <button class="btn btn-outline sm" onclick="unlockGroup('${group.group_id}')" style="margin-left:8px">🔓 Unlock</button>
  `;
}

// ── Unlock, Edit & Delete Group Actions ─────────────────────────
async function unlockGroup(groupId) {
  if (!groupId) groupId = currentGroupId;
  try {
    await api('/groups/' + groupId + '/unlock', { method: 'POST' });
    toast('Group unlocked! You can now select new stays or edit details.');
    if (currentGroupData) {
      currentGroupData.is_locked = 0;
      currentGroupData.booked_hotel = null;
      currentGroupData.booked_room = null;
    }
    openWorkspace(groupId);
  } catch (err) {
    toast(err.message, true);
  }
}

async function confirmDeleteGroup() {
  if (!currentGroupId) return;
  const gname = currentGroupData ? currentGroupData.name : 'this group';
  if (!confirm(`Are you sure you want to delete "${gname}"? All members and join requests for this group will be deleted.`)) {
    return;
  }

  try {
    await api('/groups/' + currentGroupId, { method: 'DELETE' });
    toast('Group deleted successfully');
    currentGroupId = null;
    currentGroupData = null;
    showView('dashboard');
    loadMyGroups();
  } catch (err) {
    toast(err.message, true);
  }
}

function openEditGroupModal() {
  if (!currentGroupData) return;
  document.getElementById('eg-name').value = currentGroupData.name || '';
  document.getElementById('eg-city').value = currentGroupData.city || 'Tokyo';
  document.getElementById('eg-size').value = currentGroupData.max_size || 4;
  document.getElementById('eg-in').value = currentGroupData.check_in || '2027-04-10';
  document.getElementById('eg-out').value = currentGroupData.check_out || '2027-04-15';
  document.getElementById('eg-budget').value = currentGroupData.budget_inr || 60000;
  document.getElementById('eg-itinerary').value = currentGroupData.itinerary || '';

  // Setup date constraints on edit form
  const egIn = document.getElementById('eg-in');
  const egOut = document.getElementById('eg-out');
  if (egIn && egOut) {
    egIn.min = '2027-04-01';
    egIn.max = '2027-04-20';
    egOut.min = '2027-04-01';
    egOut.max = '2027-04-20';
    egIn.onchange = () => {
      if (egIn.value) {
        egOut.min = egIn.value;
        if (egOut.value && egOut.value <= egIn.value) {
          const nextDay = new Date(new Date(egIn.value).getTime() + 86400000).toISOString().split('T')[0];
          egOut.value = nextDay <= '2027-04-20' ? nextDay : '2027-04-20';
        }
      }
    };
  }

  document.getElementById('edit-group-modal').classList.remove('hidden');
}

function closeEditGroupModal() {
  document.getElementById('edit-group-modal').classList.add('hidden');
}

function closeEditModalOutside(e) {
  if (e.target.id === 'edit-group-modal') closeEditGroupModal();
}

async function saveGroupEdits(e) {
  e.preventDefault();
  if (!currentGroupId) return;

  const checkIn = document.getElementById('eg-in').value;
  const checkOut = document.getElementById('eg-out').value;
  if (checkOut <= checkIn) {
    return toast('Check-out date must be after check-in date', true);
  }

  const payload = {
    name: document.getElementById('eg-name').value.trim(),
    city: document.getElementById('eg-city').value,
    check_in: checkIn,
    check_out: checkOut,
    max_size: +document.getElementById('eg-size').value,
    budget_inr: +document.getElementById('eg-budget').value,
    itinerary: document.getElementById('eg-itinerary').value.trim()
  };

  try {
    await api('/groups/' + currentGroupId, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    toast('Group details updated!');
    closeEditGroupModal();
    openWorkspace(currentGroupId);
  } catch (err) {
    toast(err.message, true);
  }
}

// ── Reset Demo Data to Clean State ──────────────────────────────
async function confirmResetDb() {
  if (!confirm('Reset database to clean original demo dataset? All user-created groups and test requests will be cleared, and all groups will be unlocked.')) {
    return;
  }

  try {
    const res = await api('/admin/reset-db', { method: 'POST' });
    toast(res.message || 'Database reset to fresh demo dataset! 🎉');
    await loadInterests();
    await loadDestinations();
    await loadExistingUsers();
    if (travellerId) {
      loadMyGroups();
      showView('dashboard');
    } else {
      showView('signup');
    }
  } catch (err) {
    toast(err.message, true);
  }
}

// ── Utilities ───────────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function fmt(n) {
  return Number(n).toLocaleString('en-IN');
}
