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
  const startView = params.get('view');

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

  // Reached via the "Accident History" link on drivers.html
  // (accident.html?driver=X&view=history) — jump straight to the list
  // instead of the "I've Been in an Accident" screen.
  if (startView === 'history') {
    goTo('history', { replace: true });
  } else {
    renderHome();
  }
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
    <p style="text-align:center; margin-top:20px;"><a href="#" id="historyLink">View past accidents for ${escapeHtml(driverName)}</a></p>
    <p style="text-align:center; margin-top:8px;"><a href="dashboard.html">← Back to dashboard</a></p>
  `;
  document.getElementById('startBtn').addEventListener('click', startAccident);
  document.getElementById('historyLink').addEventListener('click', (e) => {
    e.preventDefault();
    goTo('history');
  });
}

function startAccident() {
  // Get guidance on screen immediately. Never make someone wait on a
  // network call to access the safety questions — save what we can
  // in the background instead, and don't let a failed save interrupt them.
  // Reset first — accidentSessionId can be left pointing at a past
  // session after visiting it from the history list, and a brand-new
  // accident must never attach its data to an old one.
  accidentSessionId = null;
  history.length = 0;
  goTo('safe_check');
  createAccidentSessionInBackground();
}

SCREENS.history = async function () {
  content.innerHTML = `<div class="card"><p class="hint">Loading...</p></div>`;

  const { data: sessions, error } = await supabaseClient
    .from('accident_sessions')
    .select('id, status, started_at')
    .eq('driver_id', driverId)
    .order('started_at', { ascending: false });

  const header = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
      <button class="btn btn-outline" id="backBtn">← Back</button>
      <h1 style="font-size:1.3rem;">Past accidents</h1>
    </div>`;

  if (error) {
    content.innerHTML = `${header}<div class="error-msg" style="display:block;">${escapeHtml(error.message)}</div>`;
    document.getElementById('backBtn').addEventListener('click', () => goTo('home', { replace: true }));
    return;
  }

  if (!sessions.length) {
    content.innerHTML = `${header}<div class="card"><div class="empty-state">No past accidents on file for ${escapeHtml(driverName)}.</div></div>`;
    document.getElementById('backBtn').addEventListener('click', () => goTo('home', { replace: true }));
    return;
  }

  content.innerHTML = `
    ${header}
    <div class="card">
      <div class="choice-list">
        ${sessions
          .map((s) =>
            choiceBtn(
              new Date(s.started_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
              s.status === 'completed' ? 'Triage completed' : 'Triage in progress',
              `openPastSession_${s.id}`
            )
          )
          .join('')}
      </div>
    </div>
  `;

  document.getElementById('backBtn').addEventListener('click', () => goTo('home', { replace: true }));

  // Registered per-session since the action name has to be unique per
  // button — same dynamic-window-function pattern as the photo category
  // buttons below.
  sessions.forEach((s) => {
    window[`openPastSession_${s.id}`] = () => {
      accidentSessionId = s.id;
      history.length = 0;
      goTo('next_steps');
    };
  });
};

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
      <p class="hint">Next, there are a few more things you can take care of when you're ready — photos, the other driver's info, witnesses, and the police report. None of it's required right now.</p>
      <button class="btn btn-primary btn-full" id="continueBtn">Continue</button>
    </div>`;
  document.getElementById('continueBtn').addEventListener('click', () => {
    // Fire-and-forget, same as the session save itself — marking triage
    // done shouldn't make anyone wait on a network round trip.
    if (accidentSessionId) {
      supabaseClient
        .from('accident_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', accidentSessionId)
        .then(() => {});
    }
    goTo('next_steps');
  });
};

// Waits (briefly) for the background session save from startAccident() to
// finish, so the "next steps" screens always have a session_id to attach
// their data to — even if the save is still retrying when someone gets
// here fast.
async function ensureAccidentSession() {
  if (accidentSessionId) return accidentSessionId;
  for (let i = 0; i < 10 && !accidentSessionId; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return accidentSessionId;
}

function showSessionUnavailable() {
  content.innerHTML = `
    <div class="card">
      <p>Still saving your session — check your connection and try again.</p>
      <button class="btn btn-outline btn-full" id="retryBtn">Try again</button>
    </div>`;
  document.getElementById('retryBtn').addEventListener('click', () => render());
}

SCREENS.next_steps = async function () {
  content.innerHTML = `<div class="card"><p class="hint">Loading...</p></div>`;

  const sid = await ensureAccidentSession();
  if (!sid) {
    showSessionUnavailable();
    return;
  }

  const [
    { data: session },
    { count: photoCount },
    { count: otherDriverCount },
    { count: witnessCount },
    { data: policeInfo },
  ] = await Promise.all([
    supabaseClient
      .from('accident_sessions')
      .select('medical_checked, knows_how_to_get_report, insurer_contact_planned')
      .eq('id', sid)
      .single(),
    supabaseClient
      .from('accident_photos')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sid),
    supabaseClient
      .from('accident_other_drivers')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sid),
    supabaseClient
      .from('accident_witnesses')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sid),
    supabaseClient
      .from('accident_police_info')
      .select('officer_name_badge, agency, case_number')
      .eq('session_id', sid)
      .maybeSingle(),
  ]);

  const s = session || {};
  const policeFilled = !!(
    policeInfo &&
    (policeInfo.officer_name_badge || policeInfo.agency || policeInfo.case_number)
  );

  content.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
      <h1 style="font-size:1.3rem;">What's next</h1>
    </div>

    <div class="card">
      <div class="section-title">Before you go</div>
      <label style="display:flex; align-items:center; gap:10px; margin-bottom:12px; cursor:pointer;">
        <input type="checkbox" id="chkMedical" ${s.medical_checked ? 'checked' : ''}>
        <span>Everyone's been medically checked out</span>
      </label>
      <label style="display:flex; align-items:center; gap:10px; margin-bottom:12px; cursor:pointer;">
        <input type="checkbox" id="chkReport" ${s.knows_how_to_get_report ? 'checked' : ''}>
        <span>I know how to get a copy of the police report</span>
      </label>
      <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
        <input type="checkbox" id="chkInsurer" ${s.insurer_contact_planned ? 'checked' : ''}>
        <span>I have a plan to contact my insurer</span>
      </label>
    </div>

    <div class="card">
      <div class="section-title">Document the scene</div>
      <p class="hint" style="margin-bottom:14px;">Tackle these in any order, or come back later — they're all saved as you go.</p>
      <div class="choice-list">
        ${choiceBtn(
          'Photos',
          photoCount ? `${photoCount} photo${photoCount === 1 ? '' : 's'} added` : 'None added yet',
          'goToPhotos'
        )}
        ${choiceBtn(
          "Other driver's info",
          otherDriverCount ? `${otherDriverCount} added` : 'None added yet',
          'goToOtherDrivers'
        )}
        ${choiceBtn(
          'Witnesses',
          witnessCount ? `${witnessCount} added` : 'None added yet',
          'goToWitnesses'
        )}
        ${choiceBtn('Police info', policeFilled ? 'Added' : 'Not added yet', 'goToPoliceInfo')}
      </div>
    </div>

    <a class="btn btn-outline btn-full" href="dashboard.html">Back to dashboard</a>
  `;

  document.getElementById('chkMedical').addEventListener('change', (e) =>
    updateSessionFlag('medical_checked', e.target.checked)
  );
  document.getElementById('chkReport').addEventListener('change', (e) =>
    updateSessionFlag('knows_how_to_get_report', e.target.checked)
  );
  document.getElementById('chkInsurer').addEventListener('change', (e) =>
    updateSessionFlag('insurer_contact_planned', e.target.checked)
  );
};
window.goToPhotos = () => goTo('photos');
window.goToOtherDrivers = () => goTo('other_drivers');
window.goToWitnesses = () => goTo('witnesses');
window.goToPoliceInfo = () => goTo('police_info');

async function updateSessionFlag(field, value) {
  if (!accidentSessionId) return;
  await supabaseClient.from('accident_sessions').update({ [field]: value }).eq('id', accidentSessionId);
}

const PHOTO_CATEGORIES = [
  { key: 'wide', label: 'Wide shot of the scene' },
  { key: 'damage', label: 'Damage close-ups' },
  { key: 'plates', label: 'License plates' },
  { key: 'signs', label: 'Street signs / signals' },
  { key: 'skid', label: 'Skid marks' },
  { key: 'conditions', label: 'Road / weather conditions' },
  { key: 'vin', label: 'VIN' },
  { key: 'injuries', label: 'Injuries (if any)' },
  { key: 'video', label: 'Video' },
];

SCREENS.photos = async function () {
  content.innerHTML = `<div class="card"><p class="hint">Loading...</p></div>`;

  const sid = await ensureAccidentSession();
  if (!sid) {
    showSessionUnavailable();
    return;
  }

  const { data: photos } = await supabaseClient
    .from('accident_photos')
    .select('id, category, storage_path')
    .eq('session_id', sid)
    .order('created_at', { ascending: false });

  const byCategory = {};
  (photos || []).forEach((p) => {
    (byCategory[p.category] = byCategory[p.category] || []).push(p);
  });

  // The bucket is private, so the stored paths aren't directly loadable —
  // each one needs a short-lived signed URL to actually display.
  let signedUrls = {};
  if (photos && photos.length) {
    const { data: signedData } = await supabaseClient.storage
      .from('accident-photos')
      .createSignedUrls(photos.map((p) => p.storage_path), 3600);
    (signedData || []).forEach((s) => {
      if (s.signedUrl) signedUrls[s.path] = s.signedUrl;
    });
  }

  content.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
      <button class="btn btn-outline" id="backBtn">← Back</button>
      <h1 style="font-size:1.3rem;">Photos</h1>
    </div>
    <div id="photoError" class="error-msg" style="display:none;"></div>
    <p class="hint" style="margin-bottom:14px;">Tap Add under a category for a photo or video — you can add more than one per category, anytime.</p>

    ${PHOTO_CATEGORIES.map((c) => {
      const items = byCategory[c.key] || [];
      return `
        <div class="card">
          <div class="section-title">${c.label}</div>
          ${
            items.length
              ? `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
                  ${items
                    .map((p) => {
                      const url = signedUrls[p.storage_path];
                      const safePath = p.storage_path.replace(/'/g, "\\'");
                      const media =
                        !url
                          ? `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:var(--paper); color:var(--text-muted); font-size:0.7rem; text-align:center; padding:4px;">Preview unavailable</div>`
                          : c.key === 'video'
                          ? `<video src="${url}" style="width:100%; height:100%; object-fit:cover;" muted></video>`
                          : `<img src="${url}" style="width:100%; height:100%; object-fit:cover;" alt="">`;
                      return `
                        <div
                          data-photo-id="${p.id}"
                          style="position:relative; width:84px; height:84px; border-radius:8px; overflow:hidden; border:1px solid var(--line); background:#000; ${url ? 'cursor:pointer;' : ''}"
                        >
                          ${media}
                          <button
                            onclick="event.stopPropagation(); deletePhoto('${p.id}', '${safePath}')"
                            style="position:absolute; top:4px; right:4px; width:22px; height:22px; border-radius:50%; background:var(--alert); color:#fff; border:none; font-size:0.8rem; line-height:1; cursor:pointer; padding:0;"
                          >✕</button>
                        </div>`;
                    })
                    .join('')}
                </div>`
              : `<p class="hint" style="margin-bottom:12px;">None yet.</p>`
          }
          <button class="btn btn-outline" data-action="takePhoto_${c.key}">+ Add</button>
        </div>`;
    }).join('')}

    <input type="file" accept="image/*,video/*" id="photoInput" style="display:none;">
  `;

  document.getElementById('backBtn').addEventListener('click', () =>
    goTo('next_steps', { replace: true })
  );

  // Tapping a thumbnail (not the delete button — that stops propagation)
  // opens it full-size with a download option. Bound here rather than via
  // an inline onclick so the signed URL, which can contain characters
  // that would break an HTML attribute, never has to be serialized into
  // the markup string.
  content.querySelectorAll('[data-photo-id]').forEach((el) => {
    const photo = (photos || []).find((p) => p.id === el.dataset.photoId);
    if (!photo) return;
    const url = signedUrls[photo.storage_path];
    if (!url) return;
    el.addEventListener('click', () => {
      openPhotoLightbox(url, photo.category === 'video', photo.storage_path.split('/').pop());
    });
  });

  const photoInput = document.getElementById('photoInput');
  let pendingCategory = null;

  PHOTO_CATEGORIES.forEach((c) => {
    window[`takePhoto_${c.key}`] = () => {
      pendingCategory = c.key;
      photoInput.click();
    };
  });

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    photoInput.value = '';
    if (!file || !pendingCategory) return;

    const errBox = document.getElementById('photoError');
    errBox.style.display = 'none';

    // First path segment must be the owner's own auth uid — required by
    // the storage RLS policies on the accident-photos bucket.
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${currentUser.id}/${sid}/${pendingCategory}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabaseClient.storage
      .from('accident-photos')
      .upload(path, file);

    if (uploadError) {
      errBox.textContent = uploadError.message;
      errBox.style.display = 'block';
      return;
    }

    const { error: insertError } = await supabaseClient
      .from('accident_photos')
      .insert({ session_id: sid, category: pendingCategory, storage_path: path });

    if (insertError) {
      errBox.textContent = insertError.message;
      errBox.style.display = 'block';
      return;
    }

    goTo('photos', { replace: true });
  });
};

window.deletePhoto = async (id, storagePath) => {
  if (!confirm('Remove this photo?')) return;
  // Best-effort on the storage object — even if it fails (already gone,
  // network hiccup), still remove the database row so the UI doesn't
  // get stuck showing something undeletable.
  await supabaseClient.storage.from('accident-photos').remove([storagePath]);
  await supabaseClient.from('accident_photos').delete().eq('id', id);
  goTo('photos', { replace: true });
};

// Full-size viewer for a single photo/video, with a real download button.
// Signed URLs are cross-origin, so a plain <a download> is ignored by the
// browser — fetching the bytes and downloading from a same-origin blob URL
// is what actually saves the file instead of just opening it in a tab.
function closePhotoLightbox() {
  const el = document.getElementById('photoLightbox');
  if (el) el.remove();
  document.removeEventListener('keydown', lightboxKeyHandler);
}

function lightboxKeyHandler(e) {
  if (e.key === 'Escape') closePhotoLightbox();
}

window.openPhotoLightbox = (url, isVideo, filename) => {
  const overlay = document.createElement('div');
  overlay.id = 'photoLightbox';
  overlay.style.cssText =
    'position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px;';
  overlay.innerHTML = `
    <div style="position:absolute; top:16px; right:16px; display:flex; gap:10px;">
      <button id="lbDownloadBtn" class="btn btn-outline" style="background:#fff;">Download</button>
      <button id="lbCloseBtn" class="btn btn-outline" style="background:#fff;">✕ Close</button>
    </div>
    ${
      isVideo
        ? `<video src="${url}" controls style="max-width:100%; max-height:85vh; border-radius:8px;"></video>`
        : `<img src="${url}" style="max-width:100%; max-height:85vh; border-radius:8px; object-fit:contain;" alt="">`
    }
  `;
  document.body.appendChild(overlay);

  // Clicking the dark backdrop (not the media itself) closes it too.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePhotoLightbox();
  });
  document.getElementById('lbCloseBtn').addEventListener('click', closePhotoLightbox);
  document.getElementById('lbDownloadBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Downloading...';
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'photo';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert("Couldn't download this file: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });

  document.addEventListener('keydown', lightboxKeyHandler);
};

SCREENS.other_drivers = async function () {
  content.innerHTML = `<div class="card"><p class="hint">Loading...</p></div>`;

  const sid = await ensureAccidentSession();
  if (!sid) {
    showSessionUnavailable();
    return;
  }

  const { data: rows } = await supabaseClient
    .from('accident_other_drivers')
    .select('*')
    .eq('session_id', sid)
    .order('created_at', { ascending: true });

  content.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
      <button class="btn btn-outline" id="backBtn">← Back</button>
      <h1 style="font-size:1.3rem;">Other driver's info</h1>
    </div>
    <div id="odError" class="error-msg" style="display:none;"></div>

    ${(rows || [])
      .map(
        (r) => `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div style="min-width:0;">
            <div class="driver-name">${escapeHtml(r.name || 'Unnamed driver')}</div>
            ${r.phone ? `<div class="hint">${escapeHtml(r.phone)}</div>` : ''}
            ${
              r.insurer || r.policy_number
                ? `<div class="hint">${escapeHtml(r.insurer || '')}${r.insurer && r.policy_number ? ' — ' : ''}${escapeHtml(r.policy_number || '')}</div>`
                : ''
            }
          </div>
          <button class="btn btn-outline btn-delete" onclick="deleteOtherDriver('${r.id}')">Delete</button>
        </div>
      </div>`
      )
      .join('')}

    <div class="card">
      <div class="section-title">Add a driver</div>
      <div class="field"><label>Name</label><input id="od_name"></div>
      <div class="field-row">
        <div class="field"><label>Phone</label><input id="od_phone"></div>
        <div class="field"><label>Address</label><input id="od_address"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>License number</label><input id="od_license_number"></div>
        <div class="field"><label>License state</label><input id="od_license_state"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Insurer</label><input id="od_insurer"></div>
        <div class="field"><label>Policy number</label><input id="od_policy_number"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Plate number</label><input id="od_plate_number"></div>
        <div class="field"><label>Plate state</label><input id="od_plate_state"></div>
      </div>
      <div class="field"><label>VIN</label><input id="od_vin"></div>
      <div class="field"><label>Vehicle description</label><input id="od_vehicle_description" placeholder="e.g. Silver Honda Civic"></div>
      <button class="btn btn-primary btn-full" id="saveOdBtn">Add driver</button>
    </div>
  `;

  document.getElementById('backBtn').addEventListener('click', () =>
    goTo('next_steps', { replace: true })
  );

  document.getElementById('saveOdBtn').addEventListener('click', async () => {
    const errBox = document.getElementById('odError');
    errBox.style.display = 'none';

    const payload = {
      session_id: sid,
      name: document.getElementById('od_name').value.trim() || null,
      phone: document.getElementById('od_phone').value.trim() || null,
      address: document.getElementById('od_address').value.trim() || null,
      license_number: document.getElementById('od_license_number').value.trim() || null,
      license_state: document.getElementById('od_license_state').value.trim() || null,
      insurer: document.getElementById('od_insurer').value.trim() || null,
      policy_number: document.getElementById('od_policy_number').value.trim() || null,
      plate_number: document.getElementById('od_plate_number').value.trim() || null,
      plate_state: document.getElementById('od_plate_state').value.trim() || null,
      vin: document.getElementById('od_vin').value.trim() || null,
      vehicle_description: document.getElementById('od_vehicle_description').value.trim() || null,
    };

    const { error } = await supabaseClient.from('accident_other_drivers').insert(payload);
    if (error) {
      errBox.textContent = error.message;
      errBox.style.display = 'block';
      return;
    }

    goTo('other_drivers', { replace: true });
  });
};

window.deleteOtherDriver = async (id) => {
  if (!confirm("Remove this driver's info?")) return;
  await supabaseClient.from('accident_other_drivers').delete().eq('id', id);
  goTo('other_drivers', { replace: true });
};

SCREENS.witnesses = async function () {
  content.innerHTML = `<div class="card"><p class="hint">Loading...</p></div>`;

  const sid = await ensureAccidentSession();
  if (!sid) {
    showSessionUnavailable();
    return;
  }

  const { data: rows } = await supabaseClient
    .from('accident_witnesses')
    .select('*')
    .eq('session_id', sid)
    .order('created_at', { ascending: true });

  content.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
      <button class="btn btn-outline" id="backBtn">← Back</button>
      <h1 style="font-size:1.3rem;">Witnesses</h1>
    </div>
    <div id="wError" class="error-msg" style="display:none;"></div>

    ${(rows || [])
      .map(
        (r) => `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div style="min-width:0;">
            <div class="driver-name">${escapeHtml(r.name || 'Unnamed witness')}</div>
            ${r.phone ? `<div class="hint">${escapeHtml(r.phone)}</div>` : ''}
            ${r.what_they_saw ? `<div class="hint" style="margin-top:4px;">${escapeHtml(r.what_they_saw)}</div>` : ''}
          </div>
          <button class="btn btn-outline btn-delete" onclick="deleteWitness('${r.id}')">Delete</button>
        </div>
      </div>`
      )
      .join('')}

    <div class="card">
      <div class="section-title">Add a witness</div>
      <div class="field"><label>Name</label><input id="w_name"></div>
      <div class="field"><label>Phone</label><input id="w_phone"></div>
      <div class="field"><label>What they saw</label><textarea id="w_what_they_saw" rows="3"></textarea></div>
      <button class="btn btn-primary btn-full" id="saveWBtn">Add witness</button>
    </div>
  `;

  document.getElementById('backBtn').addEventListener('click', () =>
    goTo('next_steps', { replace: true })
  );

  document.getElementById('saveWBtn').addEventListener('click', async () => {
    const errBox = document.getElementById('wError');
    errBox.style.display = 'none';

    const payload = {
      session_id: sid,
      name: document.getElementById('w_name').value.trim() || null,
      phone: document.getElementById('w_phone').value.trim() || null,
      what_they_saw: document.getElementById('w_what_they_saw').value.trim() || null,
    };

    const { error } = await supabaseClient.from('accident_witnesses').insert(payload);
    if (error) {
      errBox.textContent = error.message;
      errBox.style.display = 'block';
      return;
    }

    goTo('witnesses', { replace: true });
  });
};

window.deleteWitness = async (id) => {
  if (!confirm('Remove this witness?')) return;
  await supabaseClient.from('accident_witnesses').delete().eq('id', id);
  goTo('witnesses', { replace: true });
};

SCREENS.police_info = async function () {
  content.innerHTML = `<div class="card"><p class="hint">Loading...</p></div>`;

  const sid = await ensureAccidentSession();
  if (!sid) {
    showSessionUnavailable();
    return;
  }

  const { data: info } = await supabaseClient
    .from('accident_police_info')
    .select('*')
    .eq('session_id', sid)
    .maybeSingle();

  content.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
      <button class="btn btn-outline" id="backBtn">← Back</button>
      <h1 style="font-size:1.3rem;">Police info</h1>
    </div>
    <div id="piError" class="error-msg" style="display:none;"></div>

    <div class="card">
      <div class="field"><label>Officer name / badge number</label><input id="pi_officer" value="${escapeHtml(info?.officer_name_badge || '')}"></div>
      <div class="field"><label>Agency</label><input id="pi_agency" value="${escapeHtml(info?.agency || '')}"></div>
      <div class="field"><label>Case / report number</label><input id="pi_case" value="${escapeHtml(info?.case_number || '')}"></div>
      <button class="btn btn-primary btn-full" id="savePiBtn">Save</button>
    </div>
  `;

  document.getElementById('backBtn').addEventListener('click', () =>
    goTo('next_steps', { replace: true })
  );

  document.getElementById('savePiBtn').addEventListener('click', async () => {
    const errBox = document.getElementById('piError');
    errBox.style.display = 'none';

    const payload = {
      session_id: sid,
      officer_name_badge: document.getElementById('pi_officer').value.trim() || null,
      agency: document.getElementById('pi_agency').value.trim() || null,
      case_number: document.getElementById('pi_case').value.trim() || null,
    };

    const { error } = await supabaseClient
      .from('accident_police_info')
      .upsert(payload, { onConflict: 'session_id' });

    if (error) {
      errBox.textContent = error.message;
      errBox.style.display = 'block';
      return;
    }

    goTo('next_steps', { replace: true });
  });
};

// Registered so the initial render() call below (current === 'home') has
// a valid screen to call — init() also calls renderHome() directly once
// the driver loads, which is what actually paints the real content.
SCREENS.home = renderHome;

render();
