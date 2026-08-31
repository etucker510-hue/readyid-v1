function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function infoItem(label, value) {
  if (!value) return '';
  return `<div class="info-item"><div class="label">${label}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

function renderContacts(contacts) {
  if (!contacts || !contacts.length) {
    return `<div class="hint">No emergency contacts on file.</div>`;
  }
  return contacts.map(c => `
    <div class="contact-call">
      <span>${escapeHtml(c.name || 'Contact')}${c.relationship ? ` <span class="hint">(${escapeHtml(c.relationship)})</span>` : ''}</span>
      ${c.phone_number ? `<a href="tel:${escapeHtml(c.phone_number)}">${escapeHtml(c.phone_number)}</a>` : ''}
    </div>`).join('');
}

async function loadProfile() {
  const content = document.getElementById('content');
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  // Same generic message for a missing token, a malformed token, an
  // inactive/revoked link, a nonexistent link, and a rate-limited request —
  // deliberately no way to tell these apart from the outside.
  const unavailableMessage = `<div class="empty-state">This emergency profile link isn't valid or no longer exists.</div>`;

  if (!token) {
    content.innerHTML = unavailableMessage;
    return;
  }

  const { data, error } = await supabaseClient.rpc('get_public_driver_profile', { p_token: token });

  if (error || !data || !data.length) {
    content.innerHTML = unavailableMessage;
    return;
  }

  const d = data[0];

  content.innerHTML = `
    <div class="id-card">
      <div class="eyebrow">Emergency information</div>
      <h1>${escapeHtml(d.driver_full_name)}</h1>
      ${d.blood_type ? `<div class="blood-badge">${escapeHtml(d.blood_type)}</div>` : ''}
    </div>

    ${d.emergency_instructions ? `
    <div class="card">
      <div class="section-title">Emergency instructions</div>
      <div class="info-item"><div class="value">${escapeHtml(d.emergency_instructions)}</div></div>
    </div>` : ''}

    <div class="card">
      <div class="section-title">Medical</div>
      <div class="info-grid">
        ${infoItem('Allergies', d.allergies)}
        ${infoItem('Conditions', d.medical_conditions)}
        ${infoItem('Medications', d.medications)}
      </div>
    </div>

    <div class="card">
      <div class="section-title">Emergency contacts</div>
      ${renderContacts(d.emergency_contacts)}
    </div>

    <div class="card">
      <div class="section-title">Vehicle</div>
      <div class="info-grid">
        ${infoItem('Year / Make / Model', [d.vehicle_year, d.vehicle_make, d.vehicle_model].filter(Boolean).join(' '))}
        ${infoItem('Color', d.vehicle_color)}
        ${infoItem('License plate', d.license_plate)}
      </div>
    </div>

    <div class="card">
      <div class="section-title">Insurance</div>
      <div class="info-grid">
        ${infoItem('Provider', d.insurance_provider)}
      </div>
      ${!d.insurance_provider ? `<div class="hint">No insurance info on file.</div>` : ''}
    </div>
  `;

  // No client-side logging here on purpose — get_public_driver_profile()
  // records the access itself, atomically, inside the same database call.
}

loadProfile();
