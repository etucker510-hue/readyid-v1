const errorBox = document.getElementById('errorBox');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const formCard = document.getElementById('formCard');
const waitingCard = document.getElementById('waitingCard');
const invalidCard = document.getElementById('invalidCard');
const doneCard = document.getElementById('doneCard');
const savePasswordBtn = document.getElementById('savePasswordBtn');

function showError(message) {
  errorBox.textContent = message;
  errorBox.style.display = 'block';
}

function showForm() {
  waitingCard.style.display = 'none';
  invalidCard.style.display = 'none';
  formCard.style.display = 'block';
}

let resolved = false;

// Clicking the emailed link lands here with a recovery token in the URL;
// supabase-js picks it up automatically and fires this event.
supabaseClient.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY' && !resolved) {
    resolved = true;
    showForm();
  }
});

// Fallback in case the token was already exchanged (and the session
// already exists) before the listener above was attached — check once
// the page has had a moment to settle, and only give up if there's
// genuinely no session either way (expired or already-used link).
setTimeout(async () => {
  if (resolved) return;

  const { data: { session } } = await supabaseClient.auth.getSession();

  if (session) {
    resolved = true;
    showForm();
  } else {
    waitingCard.style.display = 'none';
    invalidCard.style.display = 'block';
  }
}, 2500);

savePasswordBtn.addEventListener('click', async () => {
  errorBox.style.display = 'none';

  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (password.length < 8) {
    showError('Password must be at least 8 characters.');
    return;
  }

  if (password !== confirmPassword) {
    showError("Passwords don't match.");
    return;
  }

  savePasswordBtn.disabled = true;
  savePasswordBtn.textContent = 'Saving...';

  const { error } = await supabaseClient.auth.updateUser({ password });

  savePasswordBtn.disabled = false;
  savePasswordBtn.textContent = 'Save new password';

  if (error) {
    showError(error.message);
    return;
  }

  formCard.style.display = 'none';
  doneCard.style.display = 'block';
});
