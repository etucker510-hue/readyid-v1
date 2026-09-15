const errorBox = document.getElementById('errorBox');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

function showError(message) {
  errorBox.textContent = message;
  errorBox.style.display = 'block';
}

// Owner sign-in always goes to the dashboard. Driver devices never sign
// in here at all — they're set up separately via a per-driver setup link
// (driver-setup.html), which uses Supabase Anonymous Sign-In and never
// touches this owner-only email/password form.
function destinationAfterLogin() {
  return 'dashboard.html';
}

async function redirectIfLoggedIn() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return;

  // This page is the owner's email/password sign-in — a driver device
  // (anonymous session) has no business here. If one ends up here anyway
  // (a stray bookmark, a revoked link), send it to its own Accident
  // Assist instead of the owner dashboard it can't see anything on; if
  // it's no longer paired to anything (access was revoked), clear the
  // dead session so the normal sign-in form shows instead.
  if (session.user.is_anonymous) {
    const { data: driver } = await supabaseClient
      .from('drivers')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (driver) {
      window.location.href = `accident.html?driver=${encodeURIComponent(driver.id)}`;
    } else {
      await supabaseClient.auth.signOut();
    }
    return;
  }

  window.location.href = destinationAfterLogin();
}
redirectIfLoggedIn();

document.getElementById('signInBtn').addEventListener('click', async () => {
  errorBox.style.display = 'none';
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value,
  });
  if (error) return showError(error.message);
  window.location.href = destinationAfterLogin();
});

document.getElementById('signUpBtn').addEventListener('click', async () => {
  errorBox.style.display = 'none';

  if (passwordInput.value.length < 8) {
    return showError('Password must be at least 8 characters.');
  }

  const { error } = await supabaseClient.auth.signUp({
    email: emailInput.value.trim(),
    password: passwordInput.value,
  });
  if (error) return showError(error.message);
  // If email confirmation is off in Supabase, this signs them in immediately.
  // Name is set afterward on the Your Profile page (account.html) — not
  // collected here anymore.
  window.location.href = destinationAfterLogin();
});
