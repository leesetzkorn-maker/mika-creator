-- =====================================================================
-- Mika Creator — migration 005: ADMIN AUTH HARDENING (grant + RLS repair)
-- Run AFTER 001, schema.sql, 002, 003 and 004. Idempotent: safe to re-run.
--
-- WHY THIS FILE EXISTS
--   The previous admin setup failed repeatedly. Root cause of the SQL side was
--   a GRANT written against the wrong function identity signature
--   (`admin_get_stats(int)` for a function declared `(p_days int, p_range text)`).
--   Postgres rejects that with "function does not exist", and the Supabase SQL
--   Editor runs a pasted script inside ONE transaction — so that single line
--   rolled back every table, function, policy and grant before it, and the
--   admin dashboard could never authenticate. Hand-written GRANTs are the weak
--   link, so this file stops hand-writing them.
--
-- WHAT THIS DOES
--   1. Ensures every table the application touches exists (CREATE IF NOT EXISTS).
--      Nothing is dropped, truncated or reset — all existing rows are kept.
--   2. GRANT REPAIR, SIGNATURE-PROOF. Resolves each function from the live
--      catalog via pg_proc + `oid::regprocedure`, so the exact declared
--      signature is used automatically. A function that is absent produces a
--      WARNING, never an error, so this file can never abort a run.
--   3. REVOKEs the sensitive surface from anon/authenticated (raw votes, raw
--      reviews, admin_users, leads, customers, custom_requests) and revokes the
--      privilege-escalation helpers from the browser roles.
--   4. RLS audit: RLS enabled everywhere; the public site keeps only the
--      minimum it needs — approved comments, comment submission, analytics
--      event insert, and the aggregate read views.
--   5. Re-declares authorize_admin / revoke_admin (idempotent) and prints a
--      verification report.
--
-- SERVICE-ROLE KEYS
--   This project is fully static. There is no service-role key in the repo and
--   none is needed: the browser only ever holds the publishable anon key, and
--   every admin operation is authorised server-side by is_admin() inside a
--   SECURITY DEFINER function. authorize_admin is granted to service_role only
--   (plus the owner, i.e. you in the SQL Editor) so a visitor can never call it.
--
-- FINAL MANUAL STEP (after this file)
--   Supabase Dashboard -> Authentication -> Users -> Add User
--     email:    mikacreator8@gmail.com
--     password: (choose a strong one — set once, never stored in this repo)
--     tick "Auto Confirm User" so sign-in works without an email round-trip.
--   Then, still in the SQL Editor:
--     select public.authorize_admin('mikacreator8@gmail.com', 'Monique');
--   Then sign in at https://www.mikacreator.co.za/admin/login/
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. TABLES — create-if-missing only. No drops, no data loss.
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  object_type text not null default 'collection'
    check (object_type in ('asset','collection','global')),
  object_id   text not null default 'home',
  voter_id    text not null default '',
  name        text not null default 'Guest',
  text        text not null,
  status      text not null default 'pending'
    check (status in ('pending','approved','rejected'))
);

create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  event_type  text not null,
  path        text not null default '/',
  referrer    text not null default '',
  device      text not null default 'unknown'
    check (device in ('desktop','mobile','tablet','unknown')),
  ua_hash     text not null default '',
  extra       jsonb not null default '{}'
);

create table if not exists public.admin_users (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.custom_requests (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  name         text not null default '',
  package_id   text not null default '',
  type         text not null default '',
  custom_word  text not null default '',
  colour       text not null default '',
  placement    text not null default '',
  colour_custom text not null default '',
  location     text not null default '',
  lighting     text not null default '',
  outfit       text not null default '',
  background   text not null default '',
  mood         text not null default '',
  camera       text not null default '',
  video        text not null default '',
  other        text not null default '',
  detailed     text not null default '',
  delivery     text not null default '',
  contact_name text not null default '',
  email        text not null default '',
  method       text not null default '',
  status       text not null default 'new'
    check (status in ('new','reviewing','accepted','declined','done'))
);

create table if not exists public.leads (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  ua_hash     text not null default '',
  source      text not null default 'Direct',
  campaign    text not null default '',
  collection  text not null default '',
  page_path   text not null default '',
  channel     text not null default 'whatsapp'
    check (channel in ('whatsapp','telegram','email','custom','manual')),
  status      text not null default 'new'
    check (status in ('new','contacted','interested','paid','completed','lost')),
  note        text not null default ''
);

create table if not exists public.customers (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  entry_date  date not null default current_date,
  source      text not null default '',
  campaign    text not null default '',
  collection  text not null default '',
  product     text not null default '',
  amount      numeric(12,2) not null default 0,
  status      text not null default 'paid'
    check (status in ('paid','completed','refunded')),
  note        text not null default ''
);

create table if not exists public.assets (
  slug          text primary key,
  collection    text not null,
  visibility    text not null default 'preview'
    check (visibility in ('preview','public','hidden')),
  blur_required boolean not null default true,
  title         text,
  updated_at    timestamptz not null default now()
);

-- Idempotent supporting objects
create index if not exists comments_object_idx
  on public.comments (object_type, object_id, status, created_at);
create index if not exists analytics_events_type_idx
  on public.analytics_events (event_type, created_at);
create index if not exists analytics_events_path_idx
  on public.analytics_events (path, created_at);
create index if not exists analytics_events_date_idx
  on public.analytics_events (created_at);
create index if not exists custom_requests_status_idx
  on public.custom_requests (status, created_at);
create index if not exists leads_status_idx  on public.leads (status, created_at);
create index if not exists leads_source_idx  on public.leads (source, created_at);
create index if not exists leads_created_idx on public.leads (created_at);
create index if not exists customers_date_idx   on public.customers (entry_date, created_at);
create index if not exists customers_status_idx on public.customers (status, created_at);

-- ---------------------------------------------------------------------
-- 2. GRANT REPAIR — resolved from the catalog, so it cannot mismatch.
--    For each (function name, role) pair we look up EVERY declared overload
--    and grant its real identity signature.
-- ---------------------------------------------------------------------
do $$
declare
  spec  text[][];
  item  text[];
  v_fn  text;
  v_role text;
  r     record;
  hits  int;
  total_granted int := 0;
  missing text := '';
begin
  spec := array[
    -- public site (unauthenticated visitors) — minimum required surface
    array['toggle_vote',            'anon'],
    array['toggle_vote',            'authenticated'],
    array['count_likes',            'anon'],
    array['count_likes',            'authenticated'],
    array['count_collection_likes', 'anon'],
    array['count_collection_likes', 'authenticated'],
    array['list_comments',          'anon'],
    array['list_comments',          'authenticated'],
    array['insert_comment',         'anon'],
    array['insert_comment',         'authenticated'],
    array['insert_review',          'anon'],
    array['insert_review',          'authenticated'],
    array['get_review_stats',       'anon'],
    array['get_review_stats',       'authenticated'],
    array['insert_event',           'anon'],
    array['insert_event',           'authenticated'],
    array['submit_custom_request',  'anon'],
    array['submit_custom_request',  'authenticated'],
    -- admin surface — authenticated only; each function re-checks is_admin()
    array['admin_get_today_stats',        'authenticated'],
    array['admin_get_stats',              'authenticated'],
    array['admin_list_comments',          'authenticated'],
    array['admin_moderate_comment',       'authenticated'],
    array['admin_list_custom_requests',   'authenticated'],
    array['admin_get_conversions',        'authenticated'],
    array['admin_list_leads',             'authenticated'],
    array['admin_create_lead',            'authenticated'],
    array['admin_update_lead_status',     'authenticated'],
    array['admin_delete_lead',            'authenticated'],
    array['admin_list_customers',         'authenticated'],
    array['admin_add_customer',           'authenticated'],
    array['admin_delete_customer',        'authenticated'],
    array['is_admin',                     'authenticated']
  ];

  foreach item slice 1 in array spec loop
    v_fn   := item[1];
    v_role := item[2];
    hits   := 0;
    for r in
      select p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_fn
    loop
      execute format('grant execute on function %s to %I', r.sig, v_role);
      hits := hits + 1;
    end loop;
    if hits = 0 then
      missing := missing || v_fn || ' ';
    else
      total_granted := total_granted + hits;
    end if;
  end loop;

  raise notice 'grant repair: % signature(s) granted', total_granted;
  if missing <> '' then
    raise warning 'not present yet (run the earlier migrations first): %', missing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. REVOKE the sensitive surface from the browser roles.
--    These are re-asserted every run, so a previously over-broad grant
--    (e.g. a hand-made "make it work" grant) is undone here.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'votes', 'reviews', 'admin_users', 'leads', 'customers',
    'custom_requests', 'analytics_events'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end;
$$;

-- Public read surface is the aggregate views only (no voter_id, no status).
do $$
declare v text;
begin
  foreach v in array array['vote_counts','approved_comments','review_stats'] loop
    if to_regclass('public.' || v) is not null then
      execute format('grant select on public.%I to anon, authenticated', v);
    else
      raise warning 'view public.% does not exist yet — run schema.sql first', v;
    end if;
  end loop;
end;
$$;

-- Privilege-escalation helpers: service_role (and the owner) only.
-- A public visitor can never authorize an admin.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('authorize_admin','admin_authorize_admin',
                        'revoke_admin','admin_revoke_admin')
  loop
    execute format('revoke execute on function %s from anon, authenticated', r.sig);
    execute format('revoke execute on function %s from public', r.sig);
    execute format('grant  execute on function %s to service_role', r.sig);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY AUDIT
--    RLS on for every app table. The public site gets exactly two write
--    paths (comment submit, analytics event) and read-only aggregate views.
--    Nothing is made publicly writable.
--
--    NOTE: `ENABLE` is deliberate and `FORCE` is deliberately NOT used.
--    Every admin and public RPC in this project is SECURITY DEFINER and
--    therefore executes as the table owner. Enabling RLS makes anon and
--    authenticated subject to it, but leaves the owner unconstrained, which
--    is what those functions rely on. Adding FORCE would make the OWNER
--    subject to RLS too, and since a table with no permissive policy denies
--    everything, that would break insert_comment, insert_event, toggle_vote,
--    authorize_admin and the probe-row cleanup. Do not add FORCE here.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'votes','comments','reviews','assets','analytics_events',
    'admin_users','custom_requests','leads','customers'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end;
$$;

-- comments: the only supported write path is the SECURITY DEFINER RPC
-- insert_comment(), so anon/authenticated hold no table grant and cannot
-- insert directly. The policies below are the second line of defence: if a
-- table grant is ever added by mistake, they still prevent (a) anyone
-- reading unapproved comments and (b) anyone self-approving their own
-- comment by inserting status = 'approved'.
do $$
begin
  if to_regclass('public.comments') is not null then
    if not exists (select 1 from pg_policies
                   where schemaname='public' and tablename='comments'
                     and policyname='comments_insert_policy') then
      create policy comments_insert_policy on public.comments
        for insert to anon, authenticated with check (status = 'pending');
    end if;
    if not exists (select 1 from pg_policies
                   where schemaname='public' and tablename='comments'
                     and policyname='comments_select_approved') then
      create policy comments_select_approved on public.comments
        for select to anon, authenticated using (status = 'approved');
    end if;
  end if;
end;
$$;

-- analytics_events: append-only from the browser. No SELECT policy, so even
-- if a grant were added the raw event log stays unreadable from a browser.
do $$
begin
  if to_regclass('public.analytics_events') is not null then
    if not exists (select 1 from pg_policies
                   where schemaname='public' and tablename='analytics_events'
                     and policyname='analytics_insert_policy') then
      create policy analytics_insert_policy on public.analytics_events
        for insert to anon, authenticated with check (true);
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. ONE-TIME CLEANUP
--    A diagnostic probe against the legacy v1 toggle_vote RPC inserted a
--    synthetic row (voter_id '__probe__'). Migration 001 already discards it
--    (unmapped record_key -> null object_id -> deleted), but this makes the
--    cleanup explicit and independent of run order.
-- ---------------------------------------------------------------------
delete from public.votes where voter_id = '__probe__';

-- ---------------------------------------------------------------------
-- 6. AUTHORIZE THE ADMIN (idempotent re-declare from 004)
--    Verifies a real Supabase Auth user exists before writing the mapping,
--    so there can never be an orphan admin row.
-- ---------------------------------------------------------------------
alter table public.admin_users add column if not exists name text not null default 'Monique';
alter table public.admin_users add column if not exists authorized_at timestamptz not null default now();

create or replace function public.authorize_admin(
  p_email text,
  p_name  text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_email text;
begin
  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'bad email';
  end if;

  if not exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'No Supabase Auth user exists for % yet. Create it under Authentication > Users first.', v_email;
  end if;

  insert into public.admin_users (email, name, authorized_at)
  values (v_email, coalesce(nullif(btrim(p_name), ''), 'Monique'), now())
  on conflict (email) do update
    set name = excluded.name,
        authorized_at = now()
  returning email into v_email;

  return json_build_object('email', v_email, 'ok', true);
end;
$$;

create or replace function public.revoke_admin(p_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(btrim(coalesce(p_email, ''))) = '' then
    raise exception 'bad email';
  end if;
  delete from public.admin_users where email = lower(btrim(p_email));
  return json_build_object('ok', true);
end;
$$;

commit;

-- ---------------------------------------------------------------------
-- 7. VERIFICATION REPORT (read-only, safe to re-run)
-- ---------------------------------------------------------------------
select 'authorized admins' as check, count(*)::text as value
  from public.admin_users
union all
select 'auth users', count(*)::text from auth.users
union all
select 'votes rows',      count(*)::text from public.votes
union all
select 'reviews rows',    count(*)::text from public.reviews
union all
select 'comments rows',   count(*)::text from public.comments
union all
select 'events rows',     count(*)::text from public.analytics_events
union all
select 'leads rows',      count(*)::text from public.leads
union all
select 'customers rows',  count(*)::text from public.customers;

-- Expected after a successful run:
--   authorized admins : 1        (after the authorize_admin one-liner)
--   votes rows        : 2        (the 2 pre-existing likes, unmapped probe gone)
--   reviews rows      : 0
--   others            : 0 until real traffic arrives
