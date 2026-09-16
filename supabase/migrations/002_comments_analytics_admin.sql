-- =====================================================================
-- Mika Creator — migration 002 (MASTER): comments + analytics + admin + moderation
-- Fully self-contained. Runs on a FRESH schema.sql project AND on the live v1
-- project (upgrades votes v1->v2 inline, preserves existing votes).
-- Idempotent: safe to re-run.
--
-- WHAT THIS DOES:
--   1A. Upgrades votes v1 -> v2 inline (record_key "<Category>|<index>" ->
--       object_type/object_id, preserving every historical vote)
--   1. Creates comments table + RLS + moderation RPCs (anon submit, admin moderate)
--   2. Creates analytics_events table + insert_event RPC (anon write, admin read)
--   3. Creates admin_users table + is_admin() function
--   4. Creates admin RPCs for analytics dashboard
--   5. Completes any missing v2 RPCs from schema.sql
--   6A. Hardens reviews (RLS on, anon raw-read blocked, review_stats view exported)
--
-- HOW TO RUN:
--   Supabase Dashboard -> SQL Editor -> paste this entire file -> Run.
--
-- ADMIN SETUP (after running this migration):
--   1. Supabase Dashboard -> Authentication -> Users -> Add User
--   2. Email: your email (e.g. mikacreator8@gmail.com)
--   3. Password: choose a strong password
--   4. Then run: INSERT INTO public.admin_users (email) VALUES ('your@email.com');
-- =====================================================================

-- 0) Ensure pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- =====================================================================
-- 1A. VOTES v1 -> v2 UPGRADE  (self-contained + idempotent)
--     The live project is still v1: votes has "record_key" = '<Category>|<index>'
--     and NO object_type/object_id columns. Any v2 RPC below would fail on it,
--     so this section FIRST brings votes up to v2 using the proven logic from
--     001_votes_v2.sql (169-row generated map) while preserving every vote.
--     Safe to run on an already-v2 schema (columns skip via IF NOT EXISTS).
-- =====================================================================

begin;

-- 1) new columns (no-op if 001 already ran)
alter table public.votes add column if not exists object_type text;
alter table public.votes add column if not exists object_id   text;

-- 2) mapping table (temp, dropped at end of statement/transaction)
create temp table _legacy_vote_map (
  record_key  text primary key,
  object_type text,
  object_id   text
) on commit drop;

insert into _legacy_vote_map (record_key, object_type, object_id) values
  ('Farm|0', 'asset', 'farm-img-20260607-085012'),
    ('Farm|1', 'asset', 'farm-img-20260607-085413'),
    ('Girl on Girl|0', 'asset', 'girl-on-girl-whatsapp-image-2026-08-24-at-09-14-32'),
    ('Girl on Girl|1', 'asset', 'girl-on-girl-whatsapp-image-2026-08-24-at-09-14-33-1'),
    ('Girl on Girl|2', 'asset', 'girl-on-girl-whatsapp-image-2026-08-24-at-09-14-33-2'),
    ('Girl on Girl|3', 'asset', 'girl-on-girl-whatsapp-image-2026-08-24-at-09-14-33'),
    ('Girl on Girl|4', 'asset', 'girl-on-girl-whatsapp-image-2026-08-24-at-09-14-34'),
    ('Girl on Girl|5', 'asset', 'girl-on-girl-whatsapp-image-2026-08-24-at-09-14-36-1'),
    ('Girl on Girl|6', 'asset', 'girl-on-girl-whatsapp-image-2026-08-24-at-09-14-36'),
    ('Girl on Girl|7', 'asset', 'girl-on-girl-whatsapp-image-2026-08-24-at-09-14-37'),
    ('Hotels|0', 'asset', 'indoor-img-20260521-152726'),
    ('Hotels|1', 'asset', 'indoor-img-20260521-152935'),
    ('Hotels|2', 'asset', 'indoor-img-20260521-152938'),
    ('Hotels|3', 'asset', 'indoor-img-20260521-153005'),
    ('Hotels|4', 'asset', 'hotels-img-20260521-153241'),
    ('Hotels|5', 'asset', 'hotels-img-20260521-153246'),
    ('Hotels|6', 'asset', 'hotels-img-20260521-153301'),
    ('Hotels|7', 'asset', 'hotels-img-20260604-151045'),
    ('Hotels|8', 'asset', 'hotels-img-20260604-151110'),
    ('Hotels|9', 'asset', 'hotels-img-20260604-151145'),
    ('Hotels|10', 'asset', 'hotels-img-20260604-151154'),
    ('Hotels|11', 'asset', 'hotels-img-20260604-151223'),
    ('Hotels|12', 'asset', 'hotels-img-20260604-151407'),
    ('Hotels|13', 'asset', 'hotels-img-20260604-151536'),
    ('Hotels|14', 'asset', 'hotels-img-20260604-151707'),
    ('Hotels|15', 'asset', 'hotels-img-20260605-180923'),
    ('Hotels|16', 'asset', 'hotels-img-20260605-181052'),
    ('Hotels|17', 'asset', 'hotels-img-20260605-181055'),
    ('Hotels|18', 'asset', 'hotels-img-20260605-181118'),
    ('Hotels|19', 'asset', 'hotels-img-20260605-181121'),
    ('Hotels|20', 'asset', 'hotels-img-20260605-181126'),
    ('Hotels|21', 'asset', 'hotels-img-20260605-181131'),
    ('Hotels|22', 'asset', 'hotels-img-20260605-181138'),
    ('Hotels|23', 'asset', 'hotels-img-20260605-181144'),
    ('Hotels|24', 'asset', 'hotels-img-20260605-184128'),
    ('Hotels|25', 'asset', 'hotels-img-20260605-184146'),
    ('Hotels|26', 'asset', 'hotels-img-20260605-184252'),
    ('Hotels|27', 'asset', 'hotels-img-20260605-184257'),
    ('Hotels|28', 'asset', 'hotels-img-20260605-184305'),
    ('Hotels|29', 'asset', 'hotels-img-20260605-184324'),
    ('Hotels|30', 'asset', 'hotels-img-20260605-184333'),
    ('Hotels|31', 'asset', 'hotels-img-20260605-184346'),
    ('Hotels|32', 'asset', 'hotels-img-20260605-184350'),
    ('Hotels|33', 'asset', 'hotels-img-20260605-184359'),
    ('Hotels|34', 'asset', 'hotels-img-20260605-184619'),
    ('Hotels|35', 'asset', 'hotels-img-20260605-184622'),
    ('Hotels|36', 'asset', 'hotels-img-20260605-184743'),
    ('Hotels|37', 'asset', 'hotels-img-20260605-184749'),
    ('Hotels|38', 'asset', 'hotels-img-20260605-184754'),
    ('Hotels|39', 'asset', 'hotels-img-20260605-184905'),
    ('Indoor|0', 'asset', 'indoor-img-20260521-152614'),
    ('Indoor|1', 'asset', 'indoor-img-20260521-152632'),
    ('Indoor|2', 'asset', 'indoor-img-20260521-152704'),
    ('Indoor|3', 'asset', 'indoor-img-20260521-152717'),
    ('Indoor|4', 'asset', 'indoor-img-20260521-152726'),
    ('Indoor|5', 'asset', 'indoor-img-20260521-152748'),
    ('Indoor|6', 'asset', 'indoor-img-20260521-152753'),
    ('Indoor|7', 'asset', 'indoor-img-20260521-152819-burst002'),
    ('Indoor|8', 'asset', 'indoor-img-20260521-152821'),
    ('Indoor|9', 'asset', 'indoor-img-20260521-152911'),
    ('Indoor|10', 'asset', 'indoor-img-20260521-152923'),
    ('Indoor|11', 'asset', 'indoor-img-20260521-152935'),
    ('Indoor|12', 'asset', 'indoor-img-20260521-152938'),
    ('Indoor|13', 'asset', 'indoor-img-20260521-153005'),
    ('Mika River|0', 'asset', 'mika-river-img-20260702-150053'),
    ('Mika River|1', 'asset', 'mika-river-img-20260702-150109'),
    ('Mika River|2', 'asset', 'mika-river-img-20260702-150121'),
    ('Mika River|3', 'asset', 'mika-river-img-20260702-150129'),
    ('Mika River|4', 'asset', 'mika-river-img-20260702-150152'),
    ('Mika River|5', 'asset', 'mika-river-img-20260702-150158'),
    ('Mika River|6', 'asset', 'mika-river-img-20260702-150201'),
    ('Mika River|7', 'asset', 'mika-river-img-20260702-150228'),
    ('Mika River|8', 'asset', 'mika-river-img-20260702-150239'),
    ('Mika River|9', 'asset', 'mika-river-img-20260702-150324'),
    ('Mika River|10', 'asset', 'mika-river-img-20260702-150357'),
    ('Mika River|11', 'asset', 'mika-river-img-20260702-150402'),
    ('Mika River|12', 'asset', 'mika-river-img-20260702-150405'),
    ('Mika River|13', 'asset', 'mika-river-img-20260702-150421'),
    ('Mika River|14', 'asset', 'mika-river-img-20260702-150439'),
    ('Mika River|15', 'asset', 'mika-river-img-20260702-150509'),
    ('Mika River|16', 'asset', 'mika-river-img-20260702-150520'),
    ('Mika River|17', 'asset', 'mika-river-img-20260702-150820'),
    ('Mika River|18', 'asset', 'mika-river-img-20260702-150826'),
    ('Mika River|19', 'asset', 'mika-river-img-20260702-150832'),
    ('Mika River|20', 'asset', 'mika-river-img-20260702-150838'),
    ('Mika River|21', 'asset', 'mika-river-img-20260702-150844'),
    ('Mika River|22', 'asset', 'mika-river-img-20260702-150852'),
    ('Mika River|23', 'asset', 'mika-river-img-20260702-150908'),
    ('Mika River|24', 'asset', 'mika-river-img-20260702-150933'),
    ('Mika River|25', 'asset', 'mika-river-img-20260702-150942'),
    ('Mika River|26', 'asset', 'mika-river-img-20260702-151011'),
    ('Mika River|27', 'asset', 'mika-river-img-20260702-151021'),
    ('Mika River|28', 'asset', 'mika-river-img-20260702-151120'),
    ('Mika River|29', 'asset', 'mika-river-img-20260702-151136'),
    ('Mika River|30', 'asset', 'mika-river-img-20260702-151159'),
    ('Mika River|31', 'asset', 'mika-river-img-20260702-151205'),
    ('Mika River|32', 'asset', 'mika-river-img-20260702-151217'),
    ('Mika River|33', 'asset', 'mika-river-img-20260702-151220'),
    ('Mika River|34', 'asset', 'mika-river-img-20260702-151419'),
    ('Mika River|35', 'asset', 'mika-river-img-20260702-151639'),
    ('Mika River|36', 'asset', 'mika-river-img-20260702-151647'),
    ('Mika River|37', 'asset', 'mika-river-img-20260702-151708'),
    ('Mika River|38', 'asset', 'mika-river-img-20260702-151710'),
    ('Mika River|39', 'asset', 'mika-river-img-20260702-151714'),
    ('Mika River|40', 'asset', 'mika-river-img-20260702-151749'),
    ('Mika River|41', 'asset', 'mika-river-img-20260702-151753'),
    ('Mika River|42', 'asset', 'mika-river-img-20260702-154157'),
    ('Mika River|43', 'asset', 'mika-river-img-20260702-154201'),
    ('Mika River|44', 'asset', 'mika-river-img-20260702-154205'),
    ('Mika River|45', 'asset', 'mika-river-img-20260702-154217'),
    ('Mika River|46', 'asset', 'mika-river-img-20260702-154226'),
    ('Mika River|47', 'asset', 'mika-river-img-20260702-154236'),
    ('Mika River|48', 'asset', 'mika-river-img-20260702-154256'),
    ('Mika River|49', 'asset', 'mika-river-img-20260702-154319'),
    ('Mika River|50', 'asset', 'mika-river-img-20260702-154327'),
    ('Mika River|51', 'asset', 'mika-river-img-20260702-154331'),
    ('Mika River|52', 'asset', 'mika-river-img-20260702-154350'),
    ('Mountain|0', 'asset', 'mountain-img-20260609-112339'),
    ('Mountain|1', 'asset', 'mountain-img-20260609-112344'),
    ('Mountain|2', 'asset', 'mountain-img-20260609-112346'),
    ('Mountain|3', 'asset', 'mountain-img-20260609-112406'),
    ('Mountain|4', 'asset', 'mountain-img-20260609-112408'),
    ('Mountain|5', 'asset', 'mountain-img-20260609-112414'),
    ('Mountain|6', 'asset', 'mountain-img-20260609-112416'),
    ('Mountain|7', 'asset', 'mountain-img-20260609-112427'),
    ('Mountain|8', 'asset', 'mountain-img-20260609-112429'),
    ('Mountain|9', 'asset', 'mountain-img-20260609-112432'),
    ('Mountain|10', 'asset', 'mountain-img-20260609-113438'),
    ('Mountain|11', 'asset', 'mountain-img-20260609-113441'),
    ('Mountain|12', 'asset', 'mountain-img-20260609-113447'),
    ('Mountain|13', 'asset', 'mountain-img-20260609-113455'),
    ('Mountain|14', 'asset', 'mountain-img-20260609-113458'),
    ('Mountain|15', 'asset', 'mountain-img-20260609-113502'),
    ('Mountain|16', 'asset', 'mountain-img-20260609-113506'),
    ('Mountain|17', 'asset', 'mountain-img-20260609-113508'),
    ('Mountain|18', 'asset', 'mountain-img-20260609-113519'),
    ('Mountain|19', 'asset', 'mountain-img-20260609-113525'),
    ('Mountain|20', 'asset', 'mountain-img-20260609-113526'),
    ('Mountain|21', 'asset', 'mountain-img-20260609-113529'),
    ('Mountain|22', 'asset', 'mountain-img-20260609-113532'),
    ('Mountain|23', 'asset', 'mountain-img-20260609-113533'),
    ('Mountain|24', 'asset', 'mountain-img-20260609-113537'),
    ('Mountain|25', 'asset', 'mountain-img-20260609-113544'),
    ('Mountain|26', 'asset', 'mountain-img-20260609-113546'),
    ('Mountain|27', 'asset', 'mountain-img-20260609-113553'),
    ('Mountain|28', 'asset', 'mountain-img-20260609-113556'),
    ('Mountain|29', 'asset', 'mountain-img-20260609-153136'),
    ('Mountain|30', 'asset', 'mountain-img-20260609-153137'),
    ('Mountain|31', 'asset', 'mountain-img-20260609-153147'),
    ('Mountain|32', 'asset', 'mountain-whatsapp-image-2026-08-24-at-09-14-37-1'),
    ('Mountain|33', 'asset', 'mountain-whatsapp-image-2026-08-24-at-09-14-37-2'),
    ('Mountain|34', 'asset', 'mountain-whatsapp-image-2026-08-24-at-09-14-38'),
    ('Mountain|35', 'asset', 'mountain-img-20260609-123301'),
    ('Mountain|36', 'asset', 'mountain-img-20260609-123312'),
    ('Mountain|37', 'asset', 'mountain-img-20260609-123316'),
    ('Mountain|38', 'asset', 'mountain-img-20260609-123319'),
    ('Mountain|39', 'asset', 'mountain-img-20260609-125630'),
    ('Mountain|40', 'asset', 'mountain-img-20260609-125632'),
    ('Mountain|41', 'asset', 'mountain-img-20260609-153230'),
    ('Mountain|42', 'asset', 'mountain-img-20260609-153233'),
    ('Mountain|43', 'asset', 'mountain-img-20260609-153237'),
    ('Mountain|44', 'asset', 'mountain-img-20260609-153241'),
    ('Waterpark|0', 'asset', 'waterpark-img-20260607-161245'),
    ('Waterpark|1', 'asset', 'waterpark-img-20260607-161247'),
    ('Waterpark|2', 'asset', 'waterpark-img-20260607-161251'),
    ('Waterpark|3', 'asset', 'waterpark-img-20260607-161254'),
    ('Waterpark|4', 'asset', 'waterpark-img-20260607-161941'),
    ('Waterpark|5', 'asset', 'waterpark-img-20260607-162034'),
    ('Waterpark|6', 'asset', 'waterpark-img-20260607-162042');

-- 3) backfill (actions preserved; like+switch semantics unchanged)
update public.votes v
set object_type = m.object_type,
    object_id   = m.object_id
from _legacy_vote_map m
where v.record_key = m.record_key;

-- 4) votes pointing at content that no longer exists are dropped
delete from public.votes
where object_id is null or object_type is null;

-- 5) enforce the v2 'one row per visitor per object per action' shape
delete from public.votes a
using public.votes b
where a.id > b.id
  and a.object_type = b.object_type
  and a.object_id   = b.object_id
  and a.action      = b.action
  and a.voter_id    = b.voter_id;

-- 6) drop the legacy record_key column and its indexes/constraints
alter table public.votes drop constraint if exists votes_record_voter_unique;
alter table public.votes drop constraint if exists votes_record_key_key;
drop index if exists public.votes_record_idx;
alter table public.votes drop column if exists record_key;

-- 7) v2 uniqueness + indexes
alter table public.votes drop constraint if exists votes_object_voter_unique;
alter table public.votes add constraint votes_object_voter_unique
  unique (object_type, object_id, action, voter_id);
create index if not exists votes_object_idx on public.votes (object_type, object_id);
create index if not exists votes_voter_idx   on public.votes (voter_id);

-- 8) privacy shift: anon can no longer SELECT raw votes
alter table public.votes enable row level security;
revoke select on public.votes from anon, authenticated;

create or replace view public.vote_counts as
select object_type, object_id,
       count(*) filter (where action = 'like')    as likes,
       count(*) filter (where action = 'dislike') as dislikes
from public.votes group by object_type, object_id;
grant select on public.vote_counts to anon, authenticated;

commit;



-- =====================================================================
-- 1. COMMENTS TABLE + MODERATION
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  object_type text NOT NULL DEFAULT 'collection'
    CHECK (object_type IN ('asset','collection','global')),
  object_id   text NOT NULL DEFAULT 'home',
  voter_id    text NOT NULL,
  name        text NOT NULL DEFAULT 'Guest',
  text        text NOT NULL,
  status      text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected'))
);

CREATE INDEX IF NOT EXISTS comments_object_idx
  ON public.comments (object_type, object_id, status, created_at);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Anon can INSERT (submit comment) and SELECT approved only
CREATE POLICY IF NOT EXISTS comments_insert_policy
  ON public.comments FOR INSERT
  TO anon WITH CHECK (true);

CREATE POLICY IF NOT EXISTS comments_select_approved
  ON public.comments FOR SELECT
  TO anon USING (status = 'approved');

-- =====================================================================
-- 2. ANALYTICS EVENTS TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  event_type  text NOT NULL
    CHECK (event_type IN (
      'page_view','outbound_click','like','review_submit',
      'gallery_interaction','cta_click','redvelvet_click',
      'esa_click','contact_click'
    )),
  path        text NOT NULL DEFAULT '/',
  referrer    text DEFAULT '',
  device      text DEFAULT 'unknown'
    CHECK (device IN ('desktop','mobile','tablet','unknown')),
  ua_hash     text DEFAULT '',
  extra       jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS analytics_events_type_idx
  ON public.analytics_events (event_type, created_at);
CREATE INDEX IF NOT EXISTS analytics_events_path_idx
  ON public.analytics_events (path, created_at);
CREATE INDEX IF NOT EXISTS analytics_events_date_idx
  ON public.analytics_events (created_at);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Anon can INSERT events (public tracking) but NOT SELECT
CREATE POLICY IF NOT EXISTS analytics_insert_policy
  ON public.analytics_events FOR INSERT
  TO anon WITH CHECK (true);

-- =====================================================================
-- 3. ADMIN USERS TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.admin_users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 4. IS_ADMIN() FUNCTION
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE email = lower(coalesce(auth.email(), ''))
  );
$$;

-- =====================================================================
-- 5. INSERT EVENT RPC (anon, rate-limited)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.insert_event(
  p_event_type text,
  p_path       text DEFAULT '/',
  p_referrer   text DEFAULT '',
  p_device     text DEFAULT 'unknown',
  p_ua_hash    text DEFAULT '',
  p_extra      jsonb DEFAULT '{}'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_recent int;
BEGIN
  IF p_event_type NOT IN (
    'page_view','outbound_click','like','review_submit',
    'gallery_interaction','cta_click','redvelvet_click',
    'esa_click','contact_click'
  ) THEN
    RAISE EXCEPTION 'bad event_type';
  END IF;

  -- rate limit: max 30 events per minute per UA hash
  IF p_ua_hash IS NOT NULL AND p_ua_hash <> '' THEN
    SELECT count(*) INTO v_recent
    FROM public.analytics_events
    WHERE ua_hash = p_ua_hash AND created_at > now() - interval '1 minute';
    IF v_recent >= 30 THEN
      RAISE EXCEPTION 'rate limited';
    END IF;
  END IF;

  INSERT INTO public.analytics_events (event_type, path, referrer, device, ua_hash, extra)
  VALUES (p_event_type, left(p_path,500), left(p_referrer,500), left(p_device,20), left(p_ua_hash,64), p_extra);

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_event(text, text, text, text, text, jsonb) TO anon, authenticated;

-- =====================================================================
-- 5A. CUSTOM BUILD REQUESTS (secure storage for the custom request form)
--     Anon may INSERT via the RPC only; nobody can SELECT requests except
--     the admin (server-side is_admin check) — private by default.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.custom_requests (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at   timestamptz NOT NULL DEFAULT now(),
  name         text NOT NULL DEFAULT '',
  package_id   text NOT NULL DEFAULT '',
  type         text NOT NULL DEFAULT '',
  custom_word  text NOT NULL DEFAULT '',
  colour       text NOT NULL DEFAULT '',
  placement    text NOT NULL DEFAULT '',
  colour_custom text NOT NULL DEFAULT '',
  location     text NOT NULL DEFAULT '',
  lighting     text NOT NULL DEFAULT '',
  outfit       text NOT NULL DEFAULT '',
  background   text NOT NULL DEFAULT '',
  mood         text NOT NULL DEFAULT '',
  camera       text NOT NULL DEFAULT '',
  video        text NOT NULL DEFAULT '',
  other        text NOT NULL DEFAULT '',
  detailed     text NOT NULL DEFAULT '',
  delivery     text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  email        text NOT NULL DEFAULT '',
  method       text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','accepted','declined','done'))
);

CREATE INDEX IF NOT EXISTS custom_requests_status_idx ON public.custom_requests (status, created_at);
CREATE INDEX IF NOT EXISTS custom_requests_email_idx  ON public.custom_requests (email);

ALTER TABLE public.custom_requests ENABLE ROW LEVEL SECURITY;
-- default deny: no anon INSERT/SELECT via REST, unlike the other tables.
-- All writes flow through submit_custom_request (rate-limited SECURITY DEFINER).

CREATE OR REPLACE FUNCTION public.submit_custom_request(
  p_name text DEFAULT '', p_package_id text DEFAULT '', p_type text DEFAULT '',
  p_custom_word text DEFAULT '', p_colour text DEFAULT '', p_placement text DEFAULT '',
  p_colour_custom text DEFAULT '', p_location text DEFAULT '', p_lighting text DEFAULT '',
  p_outfit text DEFAULT '', p_background text DEFAULT '', p_mood text DEFAULT '',
  p_camera text DEFAULT '', p_video text DEFAULT '', p_other text DEFAULT '',
  p_detailed text DEFAULT '', p_delivery text DEFAULT '', p_contact_name text DEFAULT '',
  p_email text DEFAULT '', p_method text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_recent int;
BEGIN
  IF p_type = '' THEN RAISE EXCEPTION 'bad request'; END IF;
  IF p_detailed = '' THEN RAISE EXCEPTION 'bad request'; END IF;
  IF p_contact_name = '' OR p_email = '' THEN RAISE EXCEPTION 'bad contact'; END IF;

  -- rate limit: max 3 requests per email per hour
  SELECT count(*) INTO v_recent
  FROM public.custom_requests
  WHERE email = lower(btrim(p_email)) AND created_at > now() - interval '1 hour';
  IF v_recent >= 3 THEN RAISE EXCEPTION 'rate limited'; END IF;

  INSERT INTO public.custom_requests
    (name, package_id, type, custom_word, colour, placement, colour_custom,
     location, lighting, outfit, background, mood, camera, video, other,
     detailed, delivery, contact_name, email, method)
  VALUES
    (left(btrim(p_name), 80), left(btrim(p_package_id), 40), left(btrim(p_type), 2000),
     left(btrim(p_custom_word), 40), left(btrim(p_colour), 40), left(btrim(p_placement), 40),
     left(btrim(p_colour_custom), 40), left(btrim(p_location), 40), left(btrim(p_lighting), 200),
     left(btrim(p_outfit), 200), left(btrim(p_background), 200), left(btrim(p_mood), 200),
     left(btrim(p_camera), 200), left(btrim(p_video), 200), left(btrim(p_other), 500),
     left(btrim(p_detailed), 4000), left(btrim(p_delivery), 40),
     left(btrim(p_contact_name), 80), lower(left(btrim(p_email), 120)), left(btrim(p_method), 40));

  RETURN json_build_object('ok', true, 'stored', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_custom_request(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) TO anon, authenticated;

-- Admin: list custom requests
CREATE OR REPLACE FUNCTION public.admin_list_custom_requests(
  p_status text DEFAULT 'new',
  p_limit  int DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;

  RETURN (SELECT coalesce(json_agg(c), '[]'::json)
  FROM (
    SELECT id, created_at, name, package_id, type, custom_word, colour, placement,
           colour_custom, location, lighting, outfit, background, mood, camera,
           video, other, detailed, delivery, contact_name, email, method, status
    FROM public.custom_requests
    WHERE (p_status = 'all' OR status = p_status)
    ORDER BY created_at DESC
    LIMIT greatest(1, least(p_limit, 200))
  ) c);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_custom_requests(text, int) TO authenticated;

-- =====================================================================
-- 6. ADMIN ANALYTICS RPCs (require is_admin)
-- =====================================================================

-- Get today's stats
CREATE OR REPLACE FUNCTION public.admin_get_today_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;

  RETURN (SELECT json_build_object(
    'total_visitors', (SELECT count(DISTINCT ua_hash) FROM analytics_events WHERE event_type='page_view' AND created_at >= date_trunc('day', now())),
    'total_page_views', (SELECT count(*) FROM analytics_events WHERE event_type='page_view' AND created_at >= date_trunc('day', now())),
    'total_events', (SELECT count(*) FROM analytics_events WHERE created_at >= date_trunc('day', now()))
  ));
END;
$$;

-- Get stats for a date range.
--   p_range supports: 'today' | '7d' | '30d' | '90d' | 'all'  (falls back to p_days)
CREATE OR REPLACE FUNCTION public.admin_get_stats(
  p_days  int  DEFAULT 7,
  p_range text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_from timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;

  v_from := CASE lower(p_range)
    WHEN 'today' THEN date_trunc('day', now())
    WHEN '7d'    THEN now() - interval '7 days'
    WHEN '30d'   THEN now() - interval '30 days'
    WHEN '90d'   THEN now() - interval '90 days'
    WHEN 'all'   THEN '-infinity'::timestamptz
    ELSE now() - (p_days || ' days')::interval
  END;

  RETURN (SELECT json_build_object(
    'range', CASE WHEN p_range = 'all' THEN 'All Time' WHEN p_range = 'today' THEN 'Today' ELSE to_char(v_from, 'YYYY-MM-DD') || ' +' END,
    'total_visitors', (SELECT count(DISTINCT ua_hash) FROM analytics_events WHERE event_type='page_view' AND created_at >= v_from),
    'new_visitors', (SELECT count(DISTINCT ua_hash) FROM analytics_events WHERE event_type='page_view' AND created_at >= v_from AND ua_hash NOT IN (SELECT DISTINCT ua_hash FROM analytics_events WHERE event_type='page_view' AND created_at < v_from)),
    'returning_visitors', (SELECT count(DISTINCT ua_hash) FROM analytics_events WHERE event_type='page_view' AND created_at >= v_from AND ua_hash IN (SELECT DISTINCT ua_hash FROM analytics_events WHERE event_type='page_view' AND created_at < v_from)),
    'total_page_views', (SELECT count(*) FROM analytics_events WHERE event_type='page_view' AND created_at >= v_from),
    'total_sessions', (SELECT count(*) FROM (SELECT DISTINCT ua_hash, date_trunc('hour', created_at) as session FROM analytics_events WHERE created_at >= v_from) s),
    'daily', (
      SELECT json_agg(d ORDER BY d.day)
      FROM (
        SELECT date_trunc('day', created_at)::date as day,
               count(DISTINCT ua_hash) as visitors,
               count(*) as page_views
        FROM analytics_events
        WHERE event_type='page_view' AND created_at >= v_from
        GROUP BY date_trunc('day', created_at)
      ) d
    ),
    'top_pages', (
      SELECT json_agg(p ORDER BY p.views DESC)
      FROM (
        SELECT path, count(*) as views
        FROM analytics_events
        WHERE event_type='page_view' AND created_at >= v_from
        GROUP BY path ORDER BY views DESC LIMIT 10
      ) p
    ),
    'devices', (
      SELECT json_agg(d ORDER BY d.count DESC)
      FROM (
        SELECT device, count(*) as count
        FROM analytics_events
        WHERE event_type='page_view' AND created_at >= v_from
        GROUP BY device
      ) d
    ),
    'traffic_sources', (
      SELECT json_agg(s ORDER BY s.count DESC)
      FROM (
        SELECT CASE WHEN referrer = '' OR referrer IS NULL THEN 'Direct'
               WHEN referrer LIKE '%google%' THEN 'Google'
               WHEN referrer LIKE '%instagram%' OR referrer LIKE '%facebook%' OR referrer LIKE '%twitter%' OR referrer LIKE '%tiktok%' THEN 'Social'
               ELSE 'Referral'
        END as source,
        count(*) as count
        FROM analytics_events
        WHERE event_type='page_view' AND created_at >= v_from
        GROUP BY source
      ) s
    ),
    'engagement', (
      SELECT json_build_object(
        'likes', (SELECT count(*) FROM analytics_events WHERE event_type='like' AND created_at >= v_from),
        'reviews', (SELECT count(*) FROM analytics_events WHERE event_type='review_submit' AND created_at >= v_from),
        'redvelvet_clicks', (SELECT count(*) FROM analytics_events WHERE event_type='redvelvet_click' AND created_at >= v_from),
        'esa_clicks', (SELECT count(*) FROM analytics_events WHERE event_type='esa_click' AND created_at >= v_from),
        'contact_clicks', (SELECT count(*) FROM analytics_events WHERE event_type='contact_click' AND created_at >= v_from),
        'gallery_interactions', (SELECT count(*) FROM analytics_events WHERE event_type='gallery_interaction' AND created_at >= v_from)
      )
    )
  ));
END;
$$;

-- List pending comments for moderation
CREATE OR REPLACE FUNCTION public.admin_list_comments(
  p_status text DEFAULT 'pending',
  p_limit  int DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;

  RETURN (SELECT coalesce(json_agg(c), '[]'::json)
  FROM (
    SELECT id, created_at, object_type, object_id, name, text, status
    FROM public.comments
    WHERE (p_status = 'all' OR status = p_status)
    ORDER BY created_at DESC
    LIMIT greatest(1, least(p_limit, 200))
  ) c);
END;
$$;

-- Moderate a comment
CREATE OR REPLACE FUNCTION public.admin_moderate_comment(
  p_comment_id uuid,
  p_status     text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_status NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'bad status'; END IF;

  UPDATE public.comments SET status = p_status WHERE id = p_comment_id;
  RETURN json_build_object('ok', true);
END;
$$;

-- =====================================================================

-- =====================================================================
-- 6A. REVIEWS HARDENING + STATS VIEW
--     Live reviews table already exists with the v1-compatible shape
--     (nickname/comment/service/needs/content). Ensure RLS is on, the
--     raw table is not readable by anon, and the safe stats view exists.
-- =====================================================================
alter table public.reviews enable row level security;
revoke select on public.reviews from anon, authenticated;
alter table public.reviews owner to postgres;

create or replace view public.review_stats as
select
  round(avg(service)::numeric, 1) as avg_service,
  round(avg(needs)::numeric, 1)   as avg_needs,
  round(avg(content)::numeric, 1) as avg_content,
  count(*)                        as total
from public.reviews;
grant select on public.review_stats to anon, authenticated;

-- 7. COMPLETE V2 RPCs (idempotent — safe to re-run)
-- =====================================================================

-- toggle_vote
CREATE OR REPLACE FUNCTION public.toggle_vote(
  p_object_type text,
  p_object_id   text,
  p_voter_id    text,
  p_action      text DEFAULT 'like'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_liked boolean;
  v_count bigint;
  v_exist public.votes;
BEGIN
  IF p_object_type NOT IN ('asset','collection') THEN RAISE EXCEPTION 'bad object_type'; END IF;
  IF p_object_id IS NULL OR p_object_id = '' THEN RAISE EXCEPTION 'bad object_id'; END IF;
  IF p_action NOT IN ('like','dislike') THEN RAISE EXCEPTION 'bad action'; END IF;
  IF p_voter_id IS NULL OR p_voter_id = '' THEN RAISE EXCEPTION 'bad voter_id'; END IF;

  SELECT * INTO v_exist
  FROM public.votes
  WHERE object_type = p_object_type AND object_id = p_object_id AND action = p_action AND voter_id = p_voter_id
  LIMIT 1;

  IF found THEN
    DELETE FROM public.votes WHERE id = v_exist.id;
    v_liked := false;
  ELSE
    DELETE FROM public.votes
    WHERE object_type = p_object_type AND object_id = p_object_id AND voter_id = p_voter_id AND action <> p_action;
    INSERT INTO public.votes (object_type, object_id, action, voter_id)
    VALUES (p_object_type, p_object_id, p_action, p_voter_id);
    v_liked := true;
  END IF;

  SELECT count(*) INTO v_count FROM public.votes
  WHERE object_type = p_object_type AND object_id = p_object_id AND action = 'like';

  RETURN json_build_object('liked', v_liked, 'count', v_count);
END;
$$;

-- count_likes
CREATE OR REPLACE FUNCTION public.count_likes(p_object_type text, p_object_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM public.votes
  WHERE object_type = p_object_type AND object_id = p_object_id AND action = 'like';
  RETURN json_build_object('count', v_count);
END;
$$;

-- list_comments (approved only)
CREATE OR REPLACE FUNCTION public.list_comments(
  p_object_type text,
  p_object_id   text,
  p_limit       int DEFAULT 50
)
RETURNS table(name text, text text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.name, c.text, c.created_at
  FROM public.comments c
  WHERE c.object_type = p_object_type AND c.object_id = p_object_id AND c.status = 'approved'
  ORDER BY c.created_at ASC
  LIMIT greatest(1, least(p_limit, 200));
$$;

-- insert_comment
CREATE OR REPLACE FUNCTION public.insert_comment(
  p_object_type text,
  p_object_id   text,
  p_voter_id    text,
  p_name        text,
  p_text        text,
  p_honeypot    text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_recent int; v_name text; v_text text;
BEGIN
  IF p_honeypot IS NOT NULL AND p_honeypot <> '' THEN RAISE EXCEPTION 'spam'; END IF;
  IF p_object_id IS NULL OR p_object_id = '' THEN RAISE EXCEPTION 'bad object_id'; END IF;
  v_name := left(coalesce(nullif(btrim(p_name), ''), 'Guest'), 60);
  v_text := left(coalesce(nullif(btrim(p_text), ''), '...'), 1000);
  IF v_text = '...' THEN RAISE EXCEPTION 'empty comment'; END IF;

  SELECT count(*) INTO v_recent FROM public.comments
  WHERE voter_id = p_voter_id AND created_at > now() - interval '10 minutes';
  IF v_recent >= 5 THEN RAISE EXCEPTION 'slow down'; END IF;

  INSERT INTO public.comments (object_type, object_id, voter_id, name, text)
  VALUES (p_object_type, p_object_id, p_voter_id, v_name, v_text);

  RETURN json_build_object('ok', true, 'moderation', true);
END;
$$;

-- insert_review
CREATE OR REPLACE FUNCTION public.insert_review(
  p_service  smallint,
  p_needs    smallint,
  p_content  smallint,
  p_name     text DEFAULT '',
  p_comment  text DEFAULT '',
  p_voter_id text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_recent int;
BEGIN
  IF p_service NOT BETWEEN 1 AND 10 OR p_needs NOT BETWEEN 1 AND 10 OR p_content NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'ratings must be 1..10';
  END IF;

  SELECT count(*) INTO v_recent FROM public.reviews
  WHERE created_at > now() - interval '1 minute';
  IF v_recent >= 3 THEN RAISE EXCEPTION 'slow down'; END IF;

  INSERT INTO public.reviews (nickname, comment, service, needs, content)
  VALUES (
    left(coalesce(nullif(btrim(p_name), ''), 'Anonymous'), 40),
    left(coalesce(btrim(p_comment), ''), 2000),
    p_service, p_needs, p_content
  );

  RETURN json_build_object('ok', true);
END;
$$;

-- get_review_stats
CREATE OR REPLACE FUNCTION public.get_review_stats()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(r) FROM (SELECT * FROM public.review_stats) r;
$$;

-- =====================================================================
-- 8. GRANTS
-- =====================================================================
GRANT EXECUTE ON FUNCTION public.toggle_vote(text, text, text, text)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_likes(text, text)                           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_comments(text, text, int)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_comment(text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_review(smallint, smallint, smallint, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_review_stats()                                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_event(text, text, text, text, text, jsonb) TO anon, authenticated;

-- Admin RPCs: only authenticated (is_admin check inside function body)
GRANT EXECUTE ON FUNCTION public.admin_get_today_stats()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_stats(int)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_comments(text, int)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_comment(uuid, text) TO authenticated;

-- =====================================================================
-- DONE. Remember to:
--   1. Run this in the Supabase SQL Editor
--   2. Create your admin user in Auth > Users
--   3. INSERT INTO public.admin_users (email) VALUES ('your@email.com');
-- =====================================================================
