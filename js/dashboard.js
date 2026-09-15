// This is the dashboard "home" page — the navigational hub. Driver
// management (list, add/edit, per-driver log, links) lives on its own
// page now: drivers.html / js/drivers.js.

let currentUser = null;

const homeView = document.getElementById('homeView');
const logView = document.getElementById('logView');

function showView(view) {
  homeView.style.display = view === 'home' ? '' : 'none';
  logView.style.display = view === 'log' ? '' : 'none';
}

// ── Auth guard ──────────────────────────────
async function init() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  currentUser = session.user;
  loadStats();
}

init();

document.getElementById('signOutBtn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ── Dashboard actions ────────────────────────
// "+ Add Driver" jumps straight into the add-driver form on the drivers
// page, instead of making the owner click twice.
document.getElementById('dashAddDriverBtn').addEventListener('click', () => {
  window.location.href = 'drivers.html?new=1';
});

document.getElementById('dashViewDriversBtn').addEventListener('click', () => {
  window.location.href = 'drivers.html';
});

document.getElementById('dashProfileBtn').addEventListener('click', () => {
  window.location.href = 'account.html';
});

// "Activity Log" reuses the exact same access_logs table and RLS policy
// as the per-driver "Log" button on drivers.html — just without the
// driver_id filter, plus the driver's name so entries are distinguishable.
document.getElementById('dashActivityBtn').addEventListener(
  'click',
  () => viewAllLogs()
);

async function viewAllLogs() {
  const card = document.getElementById('logListCard');
  card.innerHTML = 'Loading...';

  showView('log');

  const { data, error } = await supabaseClient
    .from('access_logs')
    .select('*, drivers(full_name)')
    .order('accessed_at', { ascending: false });

  if (error) {
    card.innerHTML = `<div class="error-msg">${escapeHtml(error.message)}</div>`;
    return;
  }

  if (!data.length) {
    card.innerHTML = `<div class="empty-state">No activity recorded yet.</div>`;
    return;
  }

  card.innerHTML = data.map(l => `
    <div class="log-row">
      <span>${escapeHtml(l.drivers?.full_name || 'Unknown driver')}</span>
      <span>${new Date(l.accessed_at).toLocaleString()}</span>
    </div>
  `).join('');
}

document.getElementById('backFromLogBtn').addEventListener(
  'click',
  () => showView('home')
);

// ── Dashboard summary cards ─────────────────
// "Active Drivers" is derived from profile_links (there is no separate
// active/inactive status stored on drivers itself): a driver counts as
// active/verifiable if they currently have at least one active emergency
// link — the same check drivers.html uses to decide between "Emergency
// link active" and "No emergency link yet".
//
// There is deliberately no "Attention Needed" stat here. It doesn't come
// back until there's a real automated insurance-status feed to drive it —
// see TODO.md. It should never be "always on" from something else (like
// a missing emergency link) standing in for it.
async function loadStats() {
  const { data, error } = await supabaseClient
    .from('drivers')
    .select('id, profile_links(id, is_active)');

  if (error) {
    // Stats are a nice-to-have on this page — leave the placeholders
    // ("—") rather than breaking the whole dashboard over this.
    return;
  }

  const totalDrivers = data.length;

  const activeDrivers = data.filter(
    d => (d.profile_links || []).some(l => l.is_active)
  ).length;

  const activeLinks = data.reduce(
    (sum, d) => sum + (d.profile_links || []).filter(l => l.is_active).length,
    0
  );

  document.getElementById('statTotalDrivers').textContent = totalDrivers;
  document.getElementById('statActiveDrivers').textContent = activeDrivers;
  document.getElementById('statActiveLinks').textContent = activeLinks;
}
