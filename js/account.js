let currentUser = null;

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

  const { data: profile, error } = await supabaseClient
    .from('owner_profiles')
    .select('full_name, email')
    .eq('id', currentUser.id)
    .single();

  const errBox = document.getElementById('accountError');

  if (error) {
    errBox.textContent = `Couldn't load your profile: ${error.message}`;
    errBox.style.display = 'block';
    return;
  }

  document.getElementById('f_full_name').value = profile.full_name || '';
  document.getElementById('f_email').value = profile.email || currentUser.email || '';
}

init();

document.getElementById('signOutBtn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

document.getElementById('saveAccountBtn').addEventListener('click', async () => {
  const errBox = document.getElementById('accountError');
  const successBox = document.getElementById('accountSuccess');
  errBox.style.display = 'none';
  successBox.style.display = 'none';

  const fullName = document.getElementById('f_full_name').value.trim();

  if (!fullName) {
    errBox.textContent = 'Full name is required.';
    errBox.style.display = 'block';
    return;
  }

  const { error } = await supabaseClient
    .from('owner_profiles')
    .update({ full_name: fullName })
    .eq('id', currentUser.id);

  if (error) {
    errBox.textContent = error.message;
    errBox.style.display = 'block';
    return;
  }

  successBox.style.display = 'block';
});
