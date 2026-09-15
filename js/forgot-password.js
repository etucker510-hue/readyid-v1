const errorBox = document.getElementById('errorBox');
const emailInput = document.getElementById('email');
const formCard = document.getElementById('formCard');
const sentCard = document.getElementById('sentCard');
const sendLinkBtn = document.getElementById('sendLinkBtn');

function showError(message) {
  errorBox.textContent = message;
  errorBox.style.display = 'block';
}

sendLinkBtn.addEventListener('click', async () => {
  errorBox.style.display = 'none';

  const email = emailInput.value.trim();
  if (!email) {
    showError('Enter your email first.');
    return;
  }

  sendLinkBtn.disabled = true;
  sendLinkBtn.textContent = 'Sending...';

  // Supabase doesn't report whether the email actually matched an
  // account — that's intentional (prevents using this form to find out
  // who has a ReadyID account). We show the same message either way.
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password.html`,
  });

  sendLinkBtn.disabled = false;
  sendLinkBtn.textContent = 'Send reset link';

  if (error) {
    showError(error.message);
    return;
  }

  formCard.style.display = 'none';
  sentCard.style.display = 'block';
});
