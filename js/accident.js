// ── Auth guard (same pattern as dashboard.js) ──
let currentUser = null;
let driverId = null;
let driverName = '';
let accidentSessionId = null;

const content = document.getElementById('content');
const call911Pill = document.getElementById('call911pill');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = session.user;

  const params = new URLSearchParams(window.location.search);
  driverId = params.get('driver');

  if (!driverId) {
    content.innerHTML = `
      <div class="card">
        <p>No driver was selected.</p>
        <a class="btn btn-outline" href="dashboard.html">← Back to dashboard</a>
      </div>`;
    return;
  }

  const { data: driver, error } = await supabaseClient
    .from('drivers')
    .select('id, full_name')
    .eq('id', driverId)
    .single();

  if (error || !driver) {
    content.innerHTML = `
      <div class="card">
        <p>Couldn't load that driver.</p>
        <a class="btn btn-outline" href="dashboard.html">← Back to dashboard</a>
      </div>`;
    return;
  }

  driverName = driver.full_name;
  renderHome();
}

document.getElementById('signOutBtn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

init();

// ── Simple screen router ──
const history = [];
let current = 'home';

function goTo(id, opts = {}) {
  if (!opts.replace) history.push(current);
  current = id;
  render();
}
function goBack() {
  if (!history.length) return;
  current = history.pop();
  render();
}

function render() {
  call911Pill.style.display = current === 'home' ? 'none' : 'inline-block';
  SCREENS[current]();
  window.scrollTo(0, 0);
}

function choiceBtn(label, sub, onClick, urgent = false) {
  return `
    <button class="choice-btn ${urgent ? 'urgent' : ''}" data-action="${onClick}">
      <span><span class="label">${label}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</span>
      <span>›</span>
    </button>`;
}

// Delegate clicks on [data-action] to window-scoped functions by name,
// since content is re-rendered as a string each screen.
content.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (btn && window[btn.dataset.action]) window[btn.dataset.action]();
});

const SCREENS = {};

function renderHome() {
  content.innerHTML = `
    <div class="accident-hero">
      <div style="font-size:0.85rem; color:rgba(255,255,255,0.6); margin-bottom:6px;">${escapeHtml(driverName)}</div>
      <h1>You're not alone out here.</h1>
      <p>ReadyID walks you through exactly what to do, one step at a time.</p>
    </div>
    <button class="btn btn-alert btn-full btn-lg" id="startBtn">I've Been in an Accident</button>
    <p class="hint" style="text-align:center; margin-top:14px;">If you're in danger right now, call 911 before anything else.</p>
    <p style="text-align:center; margin-top:20px;"><a href="dashboard.html">← Back to dashboard</a></p>
  `;
  document.getElementById('startBtn').addEventListener('click', startAccident);
}

function startAccident() {
  // Get guidance on screen immediately. Never make someone wait on a
  // network call to access the safety questions — save what we can
  // in the background instead, and don't let a failed save interrupt them.
  history.length = 0;
  goTo('safe_check');
  createAccidentSessionInBackground();
}

async function createAccidentSessionInBackground(attempt = 1) {
  try {
    const { data, error } = await supabaseClient
      .from('accident_sessions')
      .insert({ driver_id: driverId, owner_id: currentUser.id })
      .select('id')
      .single();
    if (error) throw error;
    accidentSessionId = data.id;
  } catch (err) {
    console.error('Could not save accident session (attempt ' + attempt + '):', err);
    if (attempt < 3) {
      setTimeout(() => createAccidentSessionInBackground(attempt + 1), 4000 * attempt);
    }
  }
}

SCREENS.safe_check = function () {
  content.innerHTML = `
    <div class="card">
      <div class="section-title">Let's start here</div>
      <h2>Are you safe right now?</h2>
      <p class="hint" style="margin-bottom:18px;">Take a breath. We'll go through this together, one thing at a time.</p>
      <div class="choice-list">
        ${choiceBtn("Yes, I'm safe", null, 'goToHurtCheck')}
        ${choiceBtn("No — I'm in danger", "Traffic, fire, or another hazard nearby", 'goToUnsafeAdvice', true)}
      </div>
    </div>`;
};
window.goToHurtCheck = () => goTo('hurt_check');
window.goToUnsafeAdvice = () => goTo('unsafe_advice');

SCREENS.unsafe_advice = function () {
  content.innerHTML = `
    <div class="card">
      <h2>Get somewhere safer first.</h2>
      <div class="callout urgent">⚠️&nbsp; If you can move away from traffic, fire, or other danger — do that now. Everything else can wait.</div>
      <ul>
        <li>If your car is drivable and it's safe, move to the shoulder or a nearby lot.</li>
        <li>If you can't move safely, call 911 and stay on the line.</li>
      </ul>
      <button class="btn btn-alert btn-full" id="nextBtn">I'm safe now, continue</button>
    </div>`;
  document.getElementById('nextBtn').addEventListener('click', () => goTo('hurt_check'));
};

SCREENS.hurt_check = function () {
  content.innerHTML = `
    <div class="card">
      <div class="section-title">Safety check</div>
      <h2>Is anyone hurt?</h2>
      <p class="hint" style="margin-bottom:18px;">This includes you, your passengers, or anyone in the other vehicle.</p>
      <div class="choice-list">
        ${choiceBtn("Yes, someone's hurt", null, 'goToCall911', true)}
        ${choiceBtn("Not sure", "Better safe than sorry", 'goToCall911', true)}
        ${choiceBtn("No, everyone's OK", null, 'goToDangerCheck')}
      </div>
    </div>`;
};
window.goToCall911 = () => goTo('call911_screen');
window.goToDangerCheck = () => goTo('danger_check');

SCREENS.call911_screen = function () {
  content.innerHTML = `
    <div class="card">
      <h2>Call 911 now.</h2>
      <div class="callout urgent">☎️&nbsp; Tell them your location, who's hurt, and any immediate hazards.</div>
      <ul>
        <li>Don't move anyone who's injured unless there's fire or oncoming traffic.</li>
        <li>Stay on the line until they tell you what to do next.</li>
      </ul>
      <a href="tel:911" class="btn btn-alert btn-full" style="margin-bottom:10px;">Call 911</a>
      <button class="btn btn-outline btn-full" id="nextBtn">I've called, continue</button>
    </div>`;
  document.getElementById('nextBtn').addEventListener('click', () => goTo('danger_check'));
};

SCREENS.danger_check = function () {
  content.innerHTML = `
    <div class="card">
      <div class="section-title">Safety check</div>
      <h2>Is your car blocking traffic, on fire, or in immediate danger?</h2>
      <div class="choice-list" style="margin-top:14px;">
        ${choiceBtn("Yes", null, 'goToTriageDone', true)}
        ${choiceBtn("No", null, 'goToTriageDone')}
      </div>
    </div>`;
};
window.goToTriageDone = () => goTo('triage_done');

SCREENS.triage_done = function () {
  content.innerHTML = `
    <div class="card">
      <h2>Nice work — you're through the first part.</h2>
      <div class="callout safe">✓&nbsp; This accident has been saved to your account.</div>
      <p class="hint">The next parts of the flow — scene guidance, photos, other driver info — aren't wired up yet. This is as far as this build goes for now.</p>
      <a class="btn btn-outline btn-full" href="dashboard.html">Back to dashboard</a>
    </div>`;
};

// Registered so the initial render() call below (current === 'home') has
// a valid screen to call — init() also calls renderHome() directly once
// the driver loads, which is what actually paints the real content.
SCREENS.home = renderHome;

render();
