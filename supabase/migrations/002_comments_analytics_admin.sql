-- =====================================================================
-- Mika Creator — migration 002: comments, analytics, admin, moderation
--
-- WHAT THIS DOES:
--   1. Creates comments table + RLS + moderation RPCs (anon submit, admin moderate)
--   2. Creates analytics_events table + insert_event RPC (anon write, admin read)
--   3. Creates admin_users table + is_admin() function
--   4. Creates admin RPCs for analytics dashboard
--   5. Completes any missing v2 RPCs from schema.sql
--
-- HOW TO RUN:
--   Supabase Dashboard -> SQL Editor -> paste this entire file -> Run.
--
-- PREREQUISITE:
--   Run supabase/schema.sql first if not already done.
--   If 001_votes_v2.sql was already run, skip the votes parts.
--
-- ADMIN SETUP:
--   After running this migration, create your admin account:
--   1. Supabase Dashboard -> Authentication -> Users -> Add User
--   2. Email: your email (e.g. mikacreator8@gmail.com)
--   3. Password: choose a strong password
--   4. Then run: INSERT INTO public.admin_users (email) VALUES ('your@email.com');
-- =====================================================================

-- 0) Ensure pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

-- Get stats for a date range
CREATE OR REPLACE FUNCTION public.admin_get_stats(
  p_days int DEFAULT 7
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_from timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  v_from := now() - (p_days || ' days')::interval;

  RETURN (SELECT json_build_object(
    'total_visitors', (SELECT count(DISTINCT ua_hash) FROM analytics_events WHERE event_type='page_view' AND created_at >= v_from),
    'new_visitors', (SELECT count(DISTINCT ua_hash) FROM analytics_events WHERE event_type='page_view' AND created_at >= v_from AND ua_hash NOT IN (SELECT DISTINCT ua_hash FROM analytics_events WHERE event_type='page_view' AND created_at < v_from)),
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
