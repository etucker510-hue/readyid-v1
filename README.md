# ReadyID Personal — V1

A plain HTML/JS/CSS app (no build step) backed by Supabase. Deploys to Netlify from this GitHub repo.

## What's in V1

- Owner account (email/password via Supabase Auth), with the owner's name captured at signup
- Add / edit / delete drivers with medical, contact, vehicle, and insurance info
- Any number of emergency contacts per driver (name, relationship, phone) — not a fixed pair
- One or more revocable public links per driver (`profile.html?token=<token>`), no login required to view
- Every successful view of a public profile is logged with a timestamp, recorded atomically by the database itself — the frontend never writes to the access log directly
- Owner can see the access log per driver
- Owner can generate a new public link or revoke an existing one at any time, without deleting the driver

Not in V1 (on purpose): Fleet mode, payments, NFC, GPS, App Store, redesign. VIN and full insurance policy number are also deliberately never collected or stored anywhere in this app.

## Supabase architecture

The schema already lives in the Supabase project — it does **not** need to be created or run from this repo. `schema.sql` in this folder is a **reference-only snapshot** of what's already applied, headed "REFERENCE ONLY — ALREADY APPLIED TO SUPABASE — DO NOT RUN." It documents the current tables, constraints, indexes, RLS policies, and functions for onboarding purposes. Running it will fail (the objects already exist) and it must never be used as a substitute for a real migration. Any future schema change belongs in a new, properly numbered migration applied the normal way — never by editing or re-running this file.

At a glance, the live schema is:

- **owner_profiles** — one row per account holder, auto-created by a database trigger (`handle_new_user()`) when someone signs up. The owner's full name comes from the signup call's metadata (see `js/auth.js`).
- **drivers** — one row per driver, owned by an `owner_profiles` row. Holds medical info (blood type, allergies, medical conditions, medications, emergency instructions), vehicle info (year, make, model, color, license plate), and insurance provider. Capped at 10 drivers per owner, enforced by a database trigger — not just in the UI.
- **emergency_contacts** — any number of contacts per driver (name, relationship, phone), replacing what used to be two fixed columns.
- **profile_links** — the public link tokens for a driver. Each row has its own random `token`, an `is_active` flag, and a `revoked_at` timestamp, so a driver can have a link generated, copied, and later revoked without ever deleting the driver or losing history.
- **access_logs** — one row per successful public view, recorded only by the database function below. There is no policy allowing a client to insert into this table directly.
- **public_profile_rate_limit** — a small internal table backing a global rate limit; the frontend never touches it.
- **`get_public_driver_profile(p_token uuid)`** — the *only* way the public link can read a driver's data. Given a token, it checks a global rate limit, resolves the token to an active link (an invalid, inactive, or nonexistent token all produce the identical empty result — including a rate-limited request, which shows the same generic message rather than revealing that a limit was hit), logs the access, and returns just the responder-facing fields plus the driver's emergency contacts as a JSON list. It never returns internal IDs, the owner, or the token itself.

## 1. Configure Supabase

The schema is already applied — there's nothing to run here. You only need:

1. In **Authentication > Providers**, confirm Email is enabled. For fastest testing you can turn off "Confirm email" under **Authentication > Settings** so sign-up logs you in immediately — turn it back on before this is used for real.
2. In **Project Settings > API**, copy your **Project URL** and **anon public key** (the legacy JWT-style anon key, for compatibility with the `@supabase/supabase-js@2` client loaded from the CDN).

## 2. Add your Supabase credentials

Open `config.js` in this repo and set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the values from step 1. This file is safe to commit — the anon key is meant to be public; it only has the access the RLS policies and column grants in the live schema allow it.

## 3. Push to GitHub

Upload all these files to the `main` branch of your `Readyid` repo (drag-and-drop through GitHub's web UI works fine for this many files, or `git add . && git commit -m "V1 app" && git push`).

## 4. Connect Netlify

1. In Netlify, "Import from Git" and pick the `Readyid` repo, `main` branch.
2. Build command: leave blank. Publish directory: `.` (the `netlify.toml` in this repo already sets this).
3. Deploy. Every push to `main` will auto-deploy from here on.

## 5. Test it

1. Visit your Netlify URL, create an owner account (your name, email, and password).
2. Add a driver with the test data you've been using (Emma Tucker, etc), including at least one emergency contact.
3. On the driver's row, click "Get link" (or "Copy link" if one already exists) and open it in a private/incognito window — you should see the emergency profile with no login, showing the contacts you added.
4. Back in the dashboard, click "Log" on Emma's row — you should see that visit recorded.
5. Click "Revoke link" and reload the copied link — it should now show the same generic "isn't valid" message as any other invalid link.

## Notes on security

A public link's security relies on its token being an unguessable random UUID plus `get_public_driver_profile()` only ever returning one record for an exact, active token match — there's no way to browse or list drivers with the public key, and VIN/insurance policy numbers are never stored or returned in the first place. The function also enforces a global rate limit (60 requests per rolling minute, across all callers) and never distinguishes an invalid, inactive, nonexistent, or rate-limited request in its response — they all look identical from the outside. Revoking a link is immediate and doesn't require deleting the driver or losing that link's row in the access history.
