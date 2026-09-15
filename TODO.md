# ReadyID V1 — Checklist

Built from an audit of the actual codebase and live Supabase schema on 2026-09-03, then reviewed together. Check items off as they're confirmed done.

## Core workflow — built & confirmed working

- [x] Owner account: sign up / sign in / sign out (`index.html`, `js/auth.js`)
- [x] Add / edit / delete driver (now on its own page: `drivers.html`, `js/drivers.js`)
- [x] Emergency contacts — any number per driver, dynamic add/remove
- [x] Public emergency link: generate / copy / revoke (`profile_links`)
- [x] Public profile page (responder view) — contacts confirmed rendering correctly from the live RPC; blood-type badge spacing fixed so a long name can't overlap it; emergency-contact call links restyled as real branded buttons instead of plain text links
- [x] Per-driver access log
- [x] All-drivers activity log
- [x] Dashboard summary stats (Total Drivers / Active Drivers / Emergency Links Active)
- [x] Insurance provider field — display only, no automated verification (matches spec)
- [x] Blood-type droplet badge (visual)
- [x] Backend safety: rate limiting, RLS, 10-driver cap
- [x] Supabase "Confirm email" setting verified OFF
- [x] Dashboard (`dashboard.html`) is now a slim navigational home: intro, summary stats, and four shortcuts (+ Add Driver, View Your Drivers, Activity Log, Your Profile)
- [x] Driver management split onto its own page (`drivers.html`) — dashboard no longer doubles as the driver list
- [x] "Your Profile" page (`account.html`) — the owner can view/edit their own name; email shown read-only (managed through sign-in). Name is only ever editable here now — the sign-up screen collects just email/password, no longer a "Full name" field.
- [x] Consistent "← Dashboard" link in the top bar on every owner-facing page except the dashboard itself
- [x] Driver-facing "Accident Assist" flow (`accident.html`, `js/accident.js`) — guided safe/hurt/danger triage screens, Call 911 shortcut, saves an `accident_sessions` row in the background. Folded in from work that had landed directly on GitHub `main`/Netlify outside this session; now merged into the restructured pages and given real styling (the screens were previously unstyled — the CSS classes they use were never defined).
- [x] Accident Assist "What's next" checklist hub after triage — links to Photos, Other Driver Info, Witnesses, and Police Info sub-screens.
- [x] Photos sub-screen — upload photos/videos by category to the private `accident-photos` Supabase storage bucket, view actual thumbnails (not just counts) via signed URLs, and delete individual photos.
- [x] Other Driver Info, Witnesses, and Police Info sub-screens — add/edit/delete entries per accident session.
- [x] Accident History — both the driver (from the Accident Assist home screen) and the owner (from a button on each driver row in `drivers.html`) can reopen any past accident session and review/add to everything that was submitted, including adding photos or details remembered later.
- [x] Accident Summary — a read-only, printable screen (reached from "What's next") that pulls together the safety checklist, photos, other driver info, witnesses, and police info in one place, with a Print / Save as PDF button.
- [x] Visual refresh — softer, warmer color palette and rounded corners, gentler shadows, and hover states across every page.
- [x] Scoped-down driver phone access (`driver-setup.html`, `js/driver-setup.js`) — replaces the old "Set up this phone" convenience redirect, which actually gave a driver's phone the owner's *entire* account session. A driver's phone now gets its own real, restricted sign-in (Supabase Anonymous Sign-In), and can only ever reach its own Accident Assist flow — never the dashboard, the drivers list, or any other driver's data. From `drivers.html`, "Get her setup link" copies a persistent, reusable link (opening it again — new phone, browser cleared — automatically re-pairs, never needs regenerating); "Revoke phone access" cuts it off immediately. Each driver row also shows a plain-language status ("Phone linked — last used 2 days ago", a warning after 60+ days of no contact, and a note when it reconnects from a different phone or browser) — the "life happens" fail-safe/reminder discussed together, without needing email or push notifications.
- [x] Driver-row layout fixed — action buttons now stack below the driver's name/vehicle info on narrow screens instead of overlapping it.
- [x] Forgot / reset password flow (`forgot-password.html`, `reset-password.html`) — owner requests a reset email, clicks through to set a new password. Requires the Netlify domain to be listed in Supabase's Auth redirect URLs (done).

## Removed / deferred — not in V1

- [x] Verify Driver picker — removed (exploratory, no defined use case yet)
- [x] "Manage Drivers" dashboard button — removed, then reintroduced properly as its own page once the driver list actually needed to be split out
- [x] "Attention Needed" stat — removed from the dashboard entirely. It doesn't come back until there's a real automated insurance-status feed to drive it (see below) — it should never be "always on" from something else (like a missing emergency link) standing in for it.
- Automated insurance verification (API/feed) — explicitly future work, not V1. When it exists, a real "Attention Needed" indicator can return, tied only to actual issues (expired/inactive coverage, failed verification, missing info, API errors) — never just "hasn't been checked yet."

## Still open before V1 is done

- [ ] **Manual step needed**: enable Anonymous Sign-Ins in Supabase (Authentication → Sign In / Providers → Anonymous) — required for the new driver phone setup links to work. Nothing else needs to change there.
- [ ] **Manual step needed**: raise Supabase's own server-side "Minimum password length" to 8 (Authentication → Providers → Email) to match the 8-character minimum already enforced in the app.
- [x] Deploy: Netlify confirmed connected and auto-deploying from `origin/main`.
- [x] Reconcile git history: local restructure work and the divergent Accident Assist / Set up this phone commits are merged, pushed, and confirmed live on GitHub.
- [x] Security: decided against Supabase's leaked-password check for now (needs a $25/mo Pro plan upgrade for an app at this scale). Instead, raised the minimum password length from 6 to 8 characters on sign-up and password reset, and added a hint encouraging a password unique to ReadyID. Revisit the Pro upgrade if the app grows.
- [ ] End-to-end live smoke test: create a fresh account (confirm no name field at sign-up), set a name on Your Profile, add a driver, run the full forgot/reset-password flow with a real email, and confirm Accident Assist still works.
- [ ] "Send a summary" (email/share) feature — deferred, no email service connected yet (`sent_summaries` table exists in Supabase but is unused)
