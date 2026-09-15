// Landing page for a driver's persistent setup link
// (drivers.html "Get her setup link" -> driver-setup.html?token=...).
//
// This is the ONLY place a driver's own device ever gets tied to a real
// (but scoped) Supabase identity: it signs the device in anonymously,
// then calls redeem_driver_setup_link(), which is the sole path into the
// driver_device_pairings table. The link is reusable on purpose — opening
// it again (new phone, browser cleared, whatever) always re-pairs
// whichever device opens it, until the owner explicitly revokes it.

const confirmCard = document.getElementById('confirmCard');
const workingCard = document.getElementById('workingCard');
const invalidCard = document.getElementById('invalidCard');
const doneCard = document.getElementById('doneCard');
const errorBox = document.getElementById('errorBox');
const continueBtn = document.getElementById('continueBtn');

function showOnly(card) {
  [confirmCard, workingCard, invalidCard, doneCard].forEach((c) => {
    c.style.display = c === card ? 'block' : 'none';
  });
}

const token = new URLSearchParams(window.location.search).get('token');

if (!token) {
  showOnly(invalidCard);
} else {
  showOnly(confirmCard);
}

continueBtn?.addEventListener('click', async () => {
  errorBox.style.display = 'none';
  continueBtn.disabled = true;
  continueBtn.textContent = 'Setting up...';
  showOnly(workingCard);

  try {
    // Start clean — if this device is already signed in as an owner (or
    // as a different driver), that session is being deliberately replaced.
    await supabaseClient.auth.signOut();

    const { error: anonError } = await supabaseClient.auth.signInAnonymously();
    if (anonError) throw anonError;

    const { data, error: redeemError } = await supabaseClient.rpc(
      'redeem_driver_setup_link',
      { p_token: token }
    );
    if (redeemError) throw redeemError;

    const result = Array.isArray(data) ? data[0] : data;
    if (!result || !result.driver_id) {
      showOnly(invalidCard);
      return;
    }

    document.getElementById('doneMessage').textContent =
      `This phone is now set up for ${result.driver_full_name}.`;
    document.getElementById('continueLink').href =
      `accident.html?driver=${encodeURIComponent(result.driver_id)}`;
    showOnly(doneCard);
  } catch (err) {
    showOnly(confirmCard);
    errorBox.textContent = err.message || 'Something went wrong. Please try again.';
    errorBox.style.display = 'block';
  } finally {
    continueBtn.disabled = false;
    continueBtn.textContent = 'Continue';
  }
});
