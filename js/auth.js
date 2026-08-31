const errorBox = document.getElementById('errorBox');
const fullNameInput = document.getElementById('fullName');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

function showError(message) {
  errorBox.textContent = message;
  errorBox.style.display = 'block';
}

async function redirectIfLoggedIn() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) window.location.href = 'dashboard.html';
}
redirectIfLoggedIn();

document.getElementById('signInBtn').addEventListener('click', async () => {
  errorBox.style.display = 'none';
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value,
  });
  if (error) return showError(error.message);
  window.location.href = 'dashboard.html';
});

document.getElementById('signUpBtn').addEventListener('click', async () => {
  errorBox.style.display = 'none';
  const { error } = await supabaseClient.auth.signUp({
    email: emailInput.value.trim(),
    password: passwordInput.value,
    options: {
      data: { full_name: fullNameInput.value.trim() },
    },
  });
  if (error) return showError(error.message);
  // If email confirmation is off in Supabase, this signs them in immediately.
  window.location.href = 'dashboard.html';
});
