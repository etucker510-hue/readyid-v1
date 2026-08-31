let currentUser = null;
let editingDriverId = null; // null = adding a new driver

const FIELDS = [
  'full_name', 'blood_type', 'allergies', 'medical_conditions', 'medications', 'emergency_instructions',
  'vehicle_year', 'vehicle_make', 'vehicle_model', 'vehicle_color', 'license_plate',
  'insurance_provider',
];

const listView = document.getElementById('listView');
const formView = document.getElementById('formView');
const logView = document.getElementById('logView');

function showView(view) {
  listView.style.display = view === 'list' ? '' : 'none';
  formView.style.display = view === 'form' ? '' : 'none';
  logView.style.display = view === 'log' ? '' : 'none';
}

// ── Auth guard ──────────────────────────────
async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }
  currentUser = session.user;
  loadDrivers();
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

// ── List drivers ────────────────────────────
async function loadDrivers() {
  const card = document.getElementById('driverListCard');
  const { data, error } = await supabaseClient
    .from('drivers')
    .select('*, profile_links(id, token, is_active)')
    .order('created_at', { ascending: false });

  if (error) {
    card.innerHTML = `<div class="error-msg">Couldn't load drivers: ${error.message}</div>`;
    return;
  }

  if (!data.length) {
    card.innerHTML = `<div class="empty-state">No drivers yet. Add one to get their emergency link.</div>`;
    return;
  }

  card.innerHTML = data.map(d => {
    const activeLink = (d.profile_links || []).find(l => l.is_active);
    return `
      <div class="driver-row">
        <div>
          <div class="driver-name">${escapeHtml(d.full_name)}</div>
          <div class="hint">${d.vehicle_year || ''} ${escapeHtml(d.vehicle_make || '')} ${escapeHtml(d.vehicle_model || '')}</div>
        </div>
        <div class="driver-actions">
          <button class="btn btn-outline" onclick="copyLink('${d.id}', ${activeLink ? `'${activeLink.token}'` : 'null'}, this)">${activeLink ? 'Copy link' : 'Get link'}</button>
          ${activeLink ? `<a class="btn btn-outline" href="profile.html?token=${activeLink.token}" target="_blank">View</a>` : ''}
          ${activeLink ? `<button class="btn btn-outline" onclick="revokeLink('${activeLink.id}')">Revoke link</button>` : ''}
          <button class="btn btn-outline" onclick="editDriver('${d.id}')">Edit</button>
          <button class="btn btn-outline" onclick="viewLogs('${d.id}', '${escapeHtml(d.full_name)}')">Log</button>
          <button class="btn btn-outline" onclick="deleteDriver('${d.id}')">Delete</button>
        </div>
      </div>`;
  }).join('');
}

// ── Profile links: generate / copy / revoke ─
window.copyLink = async (driverId, token, btn) => {
  let created = false;
  if (!token) {
    const { data, error } = await supabaseClient
      .from('profile_links')
      .insert({ driver_id: driverId })
      .select('token')
      .single();
    if (error) { alert(error.message); return; }
    token = data.token;
    created = true;
  }

  const link = `${window.location.origin}/profile.html?token=${token}`;
  navigator.clipboard.writeText(link).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => {
      // Only a full refresh needs to happen if we just created the link
      // (so the row picks up its new View/Revoke buttons). Otherwise this
      // is the same local text-reset the old app did.
      if (created) { loadDrivers(); } else { btn.textContent = original; }
    }, 1500);
  });
};

window.revokeLink = async (linkId) => {
  if (!confirm("Revoke this link? The current URL will stop working right away. You can generate a new one anytime.")) return;
  const { error } = await supabaseClient
    .from('profile_links')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('id', linkId);
  if (error) { alert(error.message); return; }
  loadDrivers();
};

// ── Add / edit form ─────────────────────────
document.getElementById('addDriverBtn').addEventListener('click', () => openForm(null));
document.getElementById('backToListBtn').addEventListener('click', () => showView('list'));
document.getElementById('addContactBtn').addEventListener('click', () => addContactRow());

function clearContacts() {
  document.getElementById('contactsContainer').innerHTML = '';
}

// Built with DOM APIs and .value assignment (not innerHTML string
// interpolation) so a contact's own data can never be parsed as markup
// when it's loaded back into the form for editing.
function addContactRow(contact = {}) {
  const container = document.getElementById('contactsContainer');
  const row = document.createElement('div');
  row.className = 'contact-row';

  const nameField = document.createElement('div');
  nameField.className = 'field';
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Name';
  const nameInput = document.createElement('input');
  nameInput.className = 'c_name';
  nameInput.value = contact.contact_name || '';
  nameField.append(nameLabel, nameInput);

  const relField = document.createElement('div');
  relField.className = 'field';
  const relLabel = document.createElement('label');
  relLabel.textContent = 'Relationship';
  const relInput = document.createElement('input');
  relInput.className = 'c_relationship';
  relInput.placeholder = 'e.g. Mom';
  relInput.value = contact.relationship || '';
  relField.append(relLabel, relInput);

  const phoneField = document.createElement('div');
  phoneField.className = 'field';
  const phoneLabel = document.createElement('label');
  phoneLabel.textContent = 'Phone';
  const phoneInput = document.createElement('input');
  phoneInput.className = 'c_phone';
  phoneInput.placeholder = '(555) 555-5555';
  phoneInput.value = contact.phone_number || '';
  phoneField.append(phoneLabel, phoneInput);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-outline';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => row.remove());

  row.append(nameField, relField, phoneField, removeBtn);
  container.appendChild(row);
}

function readContactRows() {
  return Array.from(document.querySelectorAll('#contactsContainer .contact-row')).map((row, i) => ({
    contact_name: row.querySelector('.c_name').value.trim(),
    relationship: row.querySelector('.c_relationship').value.trim() || null,
    phone_number: row.querySelector('.c_phone').value.trim(),
    sort_order: i,
  })).filter(c => c.contact_name || c.phone_number);
}

async function openForm(driverId) {
  editingDriverId = driverId;
  document.getElementById('formError').style.display = 'none';
  document.getElementById('formTitle').textContent = driverId ? 'Edit driver' : 'Add a driver';
  FIELDS.forEach(f => { document.getElementById('f_' + f).value = ''; });
  clearContacts();

  if (driverId) {
    const [{ data: driver, error: driverError }, { data: contacts, error: contactsError }] = await Promise.all([
      supabaseClient.from('drivers').select('*').eq('id', driverId).single(),
      supabaseClient.from('emergency_contacts').select('*').eq('driver_id', driverId).order('sort_order'),
    ]);
    if (!driverError && driver) {
      FIELDS.forEach(f => { document.getElementById('f_' + f).value = driver[f] || ''; });
    }
    if (!contactsError && contacts && contacts.length) {
      contacts.forEach(c => addContactRow(c));
    } else {
      addContactRow();
    }
  } else {
    addContactRow();
  }
  showView('form');
}

window.editDriver = (id) => openForm(id);

document.getElementById('saveDriverBtn').addEventListener('click', async () => {
  const errBox = document.getElementById('formError');
  errBox.style.display = 'none';

  const payload = {};
  FIELDS.forEach(f => { payload[f] = document.getElementById('f_' + f).value.trim() || null; });

  if (!payload.full_name) {
    errBox.textContent = 'Full name is required.';
    errBox.style.display = 'block';
    return;
  }

  const contacts = readContactRows();
  let driverId = editingDriverId;
  let error;

  if (driverId) {
    ({ error } = await supabaseClient.from('drivers').update(payload).eq('id', driverId));
  } else {
    payload.owner_id = currentUser.id;
    const { data, error: insertError } = await supabaseClient.from('drivers').insert(payload).select('id').single();
    error = insertError;
    if (!error) driverId = data.id;
  }

  if (error) {
    errBox.textContent = error.message;
    errBox.style.display = 'block';
    return;
  }

  // Replace this driver's contacts wholesale — simplest way to keep the
  // form and the database in sync without diffing row-by-row.
  const { error: deleteError } = await supabaseClient.from('emergency_contacts').delete().eq('driver_id', driverId);
  if (deleteError) {
    errBox.textContent = deleteError.message;
    errBox.style.display = 'block';
    return;
  }
  if (contacts.length) {
    const { error: contactsError } = await supabaseClient
      .from('emergency_contacts')
      .insert(contacts.map(c => ({ ...c, driver_id: driverId })));
    if (contactsError) {
      errBox.textContent = contactsError.message;
      errBox.style.display = 'block';
      return;
    }
  }

  showView('list');
  loadDrivers();
});

// ── Delete ───────────────────────────────────
window.deleteDriver = async (id) => {
  if (!confirm('Remove this driver and their emergency profile? This can\'t be undone.')) return;
  const { error } = await supabaseClient.from('drivers').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  loadDrivers();
};

// ── Access log ───────────────────────────────
window.viewLogs = async (driverId, name) => {
  document.querySelector('#logView h1').textContent = `Access history — ${name}`;
  const card = document.getElementById('logListCard');
  card.innerHTML = 'Loading...';
  showView('log');

  const { data, error } = await supabaseClient
    .from('access_logs')
    .select('*')
    .eq('driver_id', driverId)
    .order('accessed_at', { ascending: false });

  if (error) { card.innerHTML = `<div class="error-msg">${error.message}</div>`; return; }
  if (!data.length) { card.innerHTML = `<div class="empty-state">No one has viewed this profile yet.</div>`; return; }

  card.innerHTML = data.map(l => `
    <div class="log-row">
      <span>${new Date(l.accessed_at).toLocaleString()}</span>
    </div>`).join('');
};

document.getElementById('backFromLogBtn').addEventListener('click', () => showView('list'));
