const API_BASE = 'http://localhost:8000/api';
let currentTravellerId = localStorage.getItem('travellerId');
let currentGroupId = localStorage.getItem('groupId');

const INTERESTS = [['TEMPLES','Temples'],['STREET_FOOD','Street food'],['NATURE','Nature'],['HIKING','Hiking'],['PHOTOGRAPHY','Photography']];
const CITIES = ['Tokyo','Kyoto','Osaka','Dubai','Abu Dhabi'];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const checked = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(c => c.value);

// Build chips and city lists
const chipHTML = name => INTERESTS.map(([v, l]) => `<label class="chip"><input type="checkbox" name="${name}" value="${v}"><span>${l}</span></label>`).join('');
$('su-chips').innerHTML = chipHTML('interest');
$('sg-chips').innerHTML = chipHTML('sg-interest');
document.querySelectorAll('.city').forEach(s => s.innerHTML = CITIES.map(c => `<option>${c}</option>`).join(''));

// UI helpers
function showAlert(message, isError = false) {
  const box = $('alert-box');
  box.textContent = message;
  box.className = isError ? 'err' : ''
  clearTimeout(showAlert.t);
  showAlert.t = setTimeout(() => box.classList.add('hidden'), 4000);
}
function showView(name) {
  ['signup', 'dashboard', 'workspace'].forEach(v => $(`view-${v}`).classList.add('hidden'));
  $(`view-${name}`).classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function setUser() {
  $('nav-user').classList.remove('hidden');
  $('nav-traveller-id').textContent = `Traveller ${currentTravellerId}`;
}
async function api(path, method = 'GET', body) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json();
    return { ok: res.ok, data };
  } catch {
    showAlert('Cannot reach the server. Check that the backend is running on port 8000.', true);
    return { ok: false, data: {} };
  }
}
const errMsg = d => typeof d.detail === 'string' ? d.detail : 'Something went wrong. Check your details and try again.';

// Tabs
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
  $('search-form').classList.toggle('hidden', t.dataset.tab !== 'search');
  $('create-form').classList.toggle('hidden', t.dataset.tab !== 'create');
}));

// Init
if (currentTravellerId) {
  setUser();
  currentGroupId ? loadWorkspace(currentGroupId) : showView('dashboard');
} else showView('signup');

function logout() { localStorage.clear(); location.reload(); }

// M1: Sign up
$('signup-form').addEventListener('submit', async e => {
  e.preventDefault();
  const interests = checked('interest');
  if (interests.length < 2) return showAlert('Pick at least 2 interests.', true);
  const { ok, data } = await api('/users/signup', 'POST', {
    name: $('su-name').value, gender: $('su-gender').value, home_city: $('su-city').value,
    gender_preference: $('su-pref').value, interests
  });
  if (!ok) return showAlert(errMsg(data), true);
  currentTravellerId = data.traveller_id;
  localStorage.setItem('travellerId', currentTravellerId);
  setUser();
  showAlert('Profile created.');
  showView('dashboard');
});

// M2: Create group
$('create-form').addEventListener('submit', async e => {
  e.preventDefault();
  const { ok, data } = await api('/groups', 'POST', {
    owner_id: currentTravellerId, name: $('cg-name').value, city: $('cg-city').value,
    check_in: $('cg-in').value, check_out: $('cg-out').value,
    max_size: parseInt($('cg-size').value), budget_inr: parseInt($('cg-budget').value),
    itinerary: $('cg-itinerary').value
  });
  if (!ok) return showAlert(errMsg(data), true);
  showAlert('Group posted.');
  loadWorkspace(data.group_id);
});

// M3 & M4: Search
$('search-form').addEventListener('submit', async e => {
  e.preventDefault();
  const interests = checked('sg-interest');
  if (interests.length < 2) return showAlert('Pick at least 2 interests to search.', true);
  const { ok, data } = await api('/search', 'POST', {
    traveller_id: currentTravellerId, city: $('sg-city').value,
    check_in: $('sg-in').value, check_out: $('sg-out').value,
    budget_inr: parseInt($('sg-budget').value), interests
  });
  if (!ok) return showAlert(errMsg(data), true);
  const box = $('results-container');
  $('search-results').classList.remove('hidden');
  if (!data.matches.length) {
    box.innerHTML = '<div class="glass empty">No groups match yet. Try different dates, or start your own group.</div>';
    return;
  }
  box.innerHTML = data.matches.map(g => `
    <article class="glass card">
      <div class="thumb">${esc(g.city)}</div>
      <div>
        <h3>${esc(g.name)}</h3>
        <p class="meta">${esc(g.dates)} · hosted by ${esc(g.owner_name)}</p>
        <span class="tag">${esc(g.shared_interests_count)} shared interests</span>
        <span class="tag">Fits your budget</span>
        <span class="tag o">${esc(g.member_count)}/${esc(g.max_size)} joined</span>
      </div>
      <button class="btn sm" onclick="joinGroup('${esc(g.group_id)}')">Join group</button>
    </article>`).join('');
});

// M5: Join
async function joinGroup(groupId) {
  const { ok, data } = await api(`/groups/${groupId}/join`, 'POST', { traveller_id: currentTravellerId });
  if (!ok) return showAlert(errMsg(data), true);
  showAlert('You joined the group.');
  loadWorkspace(groupId);
}

// M6: Workspace + hotels
async function loadWorkspace(groupId) {
  currentGroupId = groupId;
  localStorage.setItem('groupId', groupId);
  showView('workspace');
  const { ok, data } = await api(`/groups/${groupId}/workspace`);
  if (!ok) return showAlert(errMsg(data), true);
  const g = data.group;
  $('ws-group-name').textContent = g.name;
  $('ws-group-details').textContent = `${g.city} · ${g.check_in} to ${g.check_out}${g.itinerary ? ' · ' + g.itinerary : ''}`;
  $('ws-member-count').textContent = data.members.length;
  $('ws-max-size').textContent = g.max_size;
  $('ws-bar').style.width = `${Math.min(100, data.members.length / g.max_size * 100)}%`;
  $('ws-members-list').innerHTML = data.members.map(m =>
    `<span class="av"><i>${esc(m.name.charAt(0).toUpperCase())}</i>${esc(m.name)} · ${esc(m.home_city)}</span>`).join('');

  const btn = $('btn-lock');
  btn.disabled = !!g.is_locked;
  btn.textContent = g.is_locked ? 'Booking locked' : 'Lock booking';

  const h = await api(`/groups/${groupId}/hotels`);
  const box = $('ws-hotels-container');
  if (h.data.options && h.data.options.length) {
    box.innerHTML = h.data.options.map(o => `
      <article class="glass card hotel">
        <div class="thumb">${esc(o.hotel_name.charAt(0))}</div>
        <div>
          <h3>${esc(o.hotel_name)}</h3>
          <p class="meta">${esc(o.room_name)} · Total stay ₹${o.total_cost_inr.toLocaleString()}</p>
          <span class="score">${esc(o.rating)}</span>
        </div>
        <div class="price"><b>₹${o.per_person_inr.toLocaleString()}</b><p class="meta">per person</p></div>
      </article>`).join('');
  } else {
    box.innerHTML = '<div class="glass empty">No rooms fit your group size on these dates. Try changing the dates or the group size.</div>';
  }
}

// M6: Lock booking
async function lockBooking() {
  const { ok, data } = await api(`/groups/${currentGroupId}/book`, 'POST');
  if (!ok) return showAlert(errMsg(data), true);
  showAlert(data.message || 'Booking locked.');
  loadWorkspace(currentGroupId);
}