const errorBox = document.getElementById('errorBox');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

function showError(message) {
  errorBox.textContent = message;
  errorBox.style.display = 'block';
}

// Only set by the explicit "Set up this phone" action on the drivers
// page — never inferred automatically, so testing Accident Assist on
// your own phone never silently turns it into a driver's device.
function getDeviceDriver() {
  try {
    return JSON.parse(localStorage.getItem('readyid_device_driver'));
  } catch (e) {
    return null;
  }
}

function destinationAfterLogin() {
  const d = getDeviceDriver();
  return d
    ? `accident.html?driver=${encodeURIComponent(d.id)}`
    : 'dashboard.html';
}

async function redirectIfLoggedIn() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) window.location.href = destinationAfterLogin();
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
