-- ═══════════════════════════════════════════════════════════════════════
-- REFERENCE ONLY — ALREADY APPLIED TO SUPABASE — DO NOT RUN
--
-- This file documents the ReadyID Personal V1 schema exactly as it
-- already exists in the live Supabase project (migrations 0001–0008,
-- applied 2026-08-31). It is kept for reference and onboarding only.
-- Running this file will fail (objects already exist) or, if adapted
-- and run, will diverge from the real migration history. Schema changes
-- belong in new numbered migration files applied through the normal
-- migration flow — never by re-running or hand-editing this snapshot.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- owner_profiles: one row per account holder, auto-created on signup
-- ─────────────────────────────────────────────
create table public.owner_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.owner_profiles enable row level security;

create policy "owners can view own profile"
  on public.owner_profiles for select
  using (id = auth.uid());

create policy "owners can update own profile"
  on public.owner_profiles for update
  using (id = auth.uid());

-- Populated by handle_new_user() below — there is no client INSERT policy.

-- ─────────────────────────────────────────────
-- drivers: one row per driver profile, owned by an owner_profiles row
-- ─────────────────────────────────────────────
create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owner_profiles(id) on delete cascade,
  full_name text not null,
  blood_type text,
  allergies text,
  medical_conditions text,
  medications text,
  emergency_instructions text,
  vehicle_year text,
  vehicle_make text,
  vehicle_model text,
  vehicle_color text,
  license_plate text,
  insurance_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Locked V1 decision: VIN and full insurance policy number are
-- deliberately NOT stored anywhere in this schema.

create index drivers_owner_id_idx on public.drivers (owner_id);

alter table public.drivers enable row level security;

create policy "owners manage own drivers"
  on public.drivers for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create trigger drivers_set_updated_at
  before update on public.drivers
  for each row execute function public.set_updated_at();

create trigger drivers_enforce_cap
  before insert on public.drivers
  for each row execute function public.enforce_driver_cap();
-- enforce_driver_cap() takes a per-owner advisory lock
-- (pg_advisory_xact_lock on hashtextextended(owner_id)) then rejects the
-- insert once an owner already has 10 drivers.

-- ─────────────────────────────────────────────
-- emergency_contacts: N contacts per driver (replaces old contact1/2 cols)
-- ─────────────────────────────────────────────
create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  contact_name text not null,
  relationship text,
  phone_number text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index emergency_contacts_driver_id_idx on public.emergency_contacts (driver_id);
create index emergency_contacts_driver_sort_idx on public.emergency_contacts (driver_id, sort_order);

alter table public.emergency_contacts enable row level security;

create policy "owners manage own drivers' contacts"
  on public.emergency_contacts for all
  using (driver_id in (select id from public.drivers where owner_id = auth.uid()))
  with check (driver_id in (select id from public.drivers where owner_id = auth.uid()));

-- ─────────────────────────────────────────────
-- profile_links: revocable public-link tokens (replaces drivers.profile_slug)
-- ─────────────────────────────────────────────
create table public.profile_links (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint profile_links_active_revocation_consistency check (
    (is_active = true and revoked_at is null) or
    (is_active = false and revoked_at is not null)
  )
);

create unique index profile_links_token_idx on public.profile_links (token);
create index profile_links_driver_id_idx on public.profile_links (driver_id);

alter table public.profile_links enable row level security;

create policy "owners manage own drivers' links"
  on public.profile_links for all
  using (driver_id in (select id from public.drivers where owner_id = auth.uid()))
  with check (driver_id in (select id from public.drivers where owner_id = auth.uid()));

-- Column-level grants (hardened in 0008): token/id/created_at are never
-- client-writable — they are only ever set by the column defaults above.
revoke all on public.profile_links from authenticated;
grant select (id, driver_id, token, is_active, created_at, revoked_at)
  on public.profile_links to authenticated;
grant insert (driver_id, is_active, revoked_at) on public.profile_links to authenticated;
grant update (is_active, revoked_at) on public.profile_links to authenticated;

-- ─────────────────────────────────────────────
-- access_logs: recorded only by get_public_driver_profile(), never by a
-- direct client insert — there is intentionally no INSERT policy here.
-- ─────────────────────────────────────────────
create table public.access_logs (
  id uuid primary key default gen_random_uuid(),
  profile_link_id uuid not null references public.profile_links(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  accessed_at timestamptz not null default now(),
  user_agent text
);
-- Locked V1 decision: ip_address is deliberately NOT stored.

create index access_logs_driver_id_idx on public.access_logs (driver_id);
create index access_logs_driver_id_accessed_at_idx on public.access_logs (driver_id, accessed_at desc);

alter table public.access_logs enable row level security;

create policy "owners view own access logs"
  on public.access_logs for select
  using (driver_id in (select id from public.drivers where owner_id = auth.uid()));

-- ─────────────────────────────────────────────
-- public_profile_rate_limit: internal only — RLS enabled with NO policies,
-- so no client role (including service tables from PostgREST) can touch
-- it directly. Only the SECURITY DEFINER function below reads/writes it.
-- ─────────────────────────────────────────────
create table public.public_profile_rate_limit (
  bucket_start timestamptz primary key,
  request_count integer not null default 0
);

alter table public.public_profile_rate_limit enable row level security;

-- ─────────────────────────────────────────────
-- Functions (all SECURITY DEFINER except set_updated_at; all pinned
-- with `set search_path = ''` and fully schema-qualified references)
-- ─────────────────────────────────────────────

-- Auto-creates an owner_profiles row on signup, reading full_name out of
-- the signup metadata passed via supabase.auth.signUp({ options: { data } }).
-- create function public.handle_new_user() ... (trigger on auth.users)

-- Bumps drivers.updated_at on every update.
-- create function public.set_updated_at() ...

-- Per-owner 10-driver cap, race-safe via advisory lock.
-- create function public.enforce_driver_cap() ...

-- THE ONLY way the public (anon) role can read driver data. Requires the
-- exact profile_links.token. Behavior, in order:
--   1. Global rate limit: 60 requests per rolling 1-minute bucket across
--      ALL callers, checked BEFORE token validation so valid and invalid
--      tokens are never distinguishable by rate-limit behavior either.
--   2. Invalid, inactive, and nonexistent tokens all return zero rows —
--      no error, no distinguishing information.
--   3. Verifies the driver still exists.
--   4. Best-effort user-agent capture (never breaks the lookup).
--   5. Logs the access itself, atomically, inside this same call.
--   6. Returns only whitelisted fields plus emergency_contacts as a
--      jsonb array — never driver_id, owner_id, link id, or token.
-- create function public.get_public_driver_profile(p_token uuid)
--   returns table (driver_full_name text, blood_type text, allergies text,
--     medical_conditions text, medications text, emergency_instructions text,
--     vehicle_year text, vehicle_make text, vehicle_model text,
--     vehicle_color text, license_plate text, insurance_provider text,
--     emergency_contacts jsonb)
--   ...

grant execute on function public.get_public_driver_profile(uuid) to anon, authenticated;
-- EXECUTE is revoked from anon/authenticated on every other SECURITY
-- DEFINER/trigger function (handle_new_user, enforce_driver_cap,
-- set_updated_at) — those only ever run as triggers.

-- Full function bodies are omitted from this snapshot for brevity; the
-- real definitions live in the applied migrations (0001–0008) and can be
-- pulled from Supabase directly (pg_get_functiondef) if ever needed.
