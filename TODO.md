# ReadyID V1 — Checklist

Built from an audit of the actual codebase and live Supabase schema on 2026-09-03, then reviewed together. Check items off as they're confirmed done.

## Core workflow — built & confirmed working

- [x] Owner account: sign up / sign in / sign out (`index.html`, `js/auth.js`)
- [x] Add / edit / delete driver (`dashboard.html` form, `js/dashboard.js`)
- [x] Emergency contacts — any number per driver, dynamic add/remove
- [x] Public emergency link: generate / copy / revoke (`profile_links`)
- [x] Public profile page (responder view) — contacts confirmed rendering correctly from the live RPC
- [x] Per-driver access log
- [x] All-drivers activity log
- [x] Dashboard summary stats (Total Drivers / Active Drivers / Emergency Links Active / Attention Needed)
- [x] Insurance provider field — display only, no automated verification (matches spec)
- [x] Blood-type droplet badge (visual)
- [x] Backend safety: rate limiting, RLS, 10-driver cap
- [x] Supabase "Confirm email" setting verified OFF

## Removed / deferred — not in V1

- [x] Verify Driver picker — removed (exploratory, no defined use case yet)
- [x] "Manage Drivers" dashboard button — removed (only useful once driver lists get large; revisit in a future version)
- Automated insurance verification (API/feed) — explicitly future work, not V1. When it exists, "Attention Needed" can start reflecting real issues (expired/inactive coverage, failed verification, missing info, API errors) — not "hasn't been checked yet."

## Still open before V1 is done

- [ ] Deploy: reconnect Netlify (paused while deciding on credits vs. paying)
- [ ] Security: enable Supabase leaked-password protection (needs a Pro plan upgrade — currently on Free)
- [ ] Commit and push the accumulated local changes (blood-type droplet badge, Verify Driver removal, Manage Drivers removal)
- [ ] End-to-end live smoke test once deployed to Netlify
