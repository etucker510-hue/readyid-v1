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
- [x] "Your Profile" page (`account.html`) — the owner can view/edit their own name; email shown read-only (managed through sign-in)
- [x] Consistent "← Dashboard" link in the top bar on every owner-facing page except the dashboard itself
- [x] Driver-facing "Accident Assist" flow (`accident.html`, `js/accident.js`) — guided safe/hurt/danger triage screens, Call 911 shortcut, saves an `accident_sessions` row in the background. Folded in from work that had landed directly on GitHub `main`/Netlify outside this session; now merged into the restructured pages and given real styling (the screens were previously unstyled — the CSS classes they use were never defined). As-built, the flow stops after triage: scene guidance, photos, other-driver info, and witnesses aren't wired up yet.
- [x] "Set up this phone" (per-driver button on `drivers.html`) — one-time, explicit action that makes a phone open straight to that driver's Accident Assist flow on future sign-ins (`localStorage`, never inferred automatically). Also folded in from the same divergent work.

## Removed / deferred — not in V1

- [x] Verify Driver picker — removed (exploratory, no defined use case yet)
- [x] "Manage Drivers" dashboard button — removed, then reintroduced properly as its own page once the driver list actually needed to be split out
- [x] "Attention Needed" stat — removed from the dashboard entirely. It doesn't come back until there's a real automated insurance-status feed to drive it (see below) — it should never be "always on" from something else (like a missing emergency link) standing in for it.
- Automated insurance verification (API/feed) — explicitly future work, not V1. When it exists, a real "Attention Needed" indicator can return, tied only to actual issues (expired/inactive coverage, failed verification, missing info, API errors) — never just "hasn't been checked yet."

## Still open before V1 is done

- [ ] Deploy: reconnect Netlify (paused while deciding on credits vs. paying)
- [ ] Security: enable Supabase leaked-password protection (needs a Pro plan upgrade — currently on Free)
- [ ] Reconcile git history: local work (droplet badge, page restructure, Your Profile page, Attention Needed removal) diverged from 6 commits already pushed to `origin/main` (Accident Assist + Set up this phone). Folded together locally; still needs a real commit/push plan since a plain push will be rejected.
- [ ] End-to-end live smoke test once deployed to Netlify
- [ ] Finish the rest of the Accident Assist flow: scene guidance, photos, other-driver info, witnesses (tables already exist in Supabase: `accident_photos`, `accident_other_drivers`, `accident_witnesses`, `accident_police_info`, `sent_summaries`)
