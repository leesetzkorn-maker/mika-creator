-- =====================================================================
-- Mika Creator — Supabase schema v2  (FRESH / new project install)
--
-- Privacy hardening vs v1:
--   * anon can NO LONGER read raw votes/comments (voter_id never exposed)
--   * counts & approved comments surface only through SECURITY DEFINER views/RPCs
--   * likes/comments toggle & insert through RPCs only
--
-- HOW TO RUN (fresh project): Supabase Dashboard -> SQL Editor -> paste + Run.
-- For an EXISTING v1 project run the generated migration first:
--   supabase/migrations/001_votes_v2.sql  (backfills record_key -> new ids)
-- then this file is not needed except for comments/reviews (handled in 002).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. votes — per object (asset | collection) like/dislike.
--    v1 stored record_key "<Category>|<index>"; v2 stores object_type/id.
-- ---------------------------------------------------------------------
create table if not exists public.votes (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  object_type text not null constraint votes_object_type_check check (object_type in ('asset','collection')),
  object_id   text not null,
  action      text not null constraint votes_action_check check (action in ('like','dislike')),
  voter_id    text not null,
  constraint votes_object_voter_unique unique (object_type, object_id, action, voter_id)
);

create index if not exists votes_object_idx on public.votes (object_type, object_id);
create index if not exists votes_voter_idx on public.votes (voter_id);

alter table public.votes enable row level security;
-- NO anon select — that is the whole point of v2 (voter_id privacy).

-- ---------------------------------------------------------------------
-- 2. comments — moderation queue. anon sees only approved rows via view.
-- ---------------------------------------------------------------------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  object_type text not null constraint comments_object_type_check check (object_type in ('asset','collection')),
  object_id   text not null,
  voter_id    text not null,
  name        text not null default 'Guest',
  text        text not null,
  status      text not null default 'pending' constraint comments_status_check check (status in ('pending','approved','rejected'))
);

create index if not exists comments_object_idx on public.comments (object_type, object_id, status, created_at);

alter table public.comments enable row level security;

-- ---------------------------------------------------------------------
-- 3. reviews — kept identical shape to v1 so existing rows stay valid.
-- ---------------------------------------------------------------------
create table if not exists public.reviews (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  nickname     text not null default 'Anonymous',
  comment      text not null default '',
  service      smallint not null constraint reviews_service_check check (service between 1 and 10),
  needs        smallint not null constraint reviews_needs_check check (needs between 1 and 10),
  content      smallint not null constraint reviews_content_check check (content between 1 and 10),
  display_date text not null default ''
);

create index if not exists reviews_created_idx on public.reviews (created_at);

alter table public.reviews enable row level security;

-- ---------------------------------------------------------------------
-- 4. anon surface (views) — nobody can read voter_id anywhere.
-- ---------------------------------------------------------------------
create or replace view public.vote_counts as
select object_type, object_id,
       count(*) filter (where action = 'like')  as likes,
       count(*) filter (where action = 'dislike') as dislikes
from public.votes group by object_type, object_id;

create or replace view public.approved_comments as
select id, object_type, object_id, name, text, created_at
from public.comments where status = 'approved';

create or replace view public.review_stats as
select
  round(avg(service)::numeric, 1) as avg_service,
  round(avg(needs)::numeric, 1)   as avg_needs,
  round(avg(content)::numeric, 1) as avg_content,
  count(*)                        as total
from public.reviews;

-- Existing select privileges are scoped to these views only.
alter table public.votes      owner to postgres;
alter table public.comments   owner to postgres;
alter table public.reviews    owner to postgres;

grant select on public.vote_counts      to anon, authenticated;
grant select on public.approved_comments to anon, authenticated;
grant select on public.review_stats     to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. RPCs (all SECURITY DEFINER, defensive search_path, param validation)
-- ---------------------------------------------------------------------
set search_path = public;

-- toggle a vote; returns { liked, count } (count = likes for object)
create or replace function public.toggle_vote(
  p_object_type text,
  p_object_id   text,
  p_voter_id    text,
  p_action      text default 'like'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_liked  boolean;
  v_count  bigint;
  v_exist  public.votes;
begin
  if p_object_type not in ('asset','collection') then
    raise exception 'bad object_type';
  end if;
  if p_object_id is null or p_object_id = '' then
    raise exception 'bad object_id';
  end if;
  if p_action not in ('like','dislike') then
    raise exception 'bad action';
  end if;
  if p_voter_id is null or p_voter_id = '' then
    raise exception 'bad voter_id';
  end if;

  select * into v_exist
  from public.votes
  where object_type = p_object_type
    and object_id   = p_object_id
    and action      = p_action
    and voter_id    = p_voter_id
  limit 1;

  if found then
    delete from public.votes where id = v_exist.id;
    v_liked := false;
  else
    delete from public.votes
    where object_type = p_object_type
      and object_id   = p_object_id
      and voter_id    = p_voter_id
      and action     <> p_action;          -- keep one row per visitor per object
    insert into public.votes (object_type, object_id, action, voter_id)
    values (p_object_type, p_object_id, p_action, p_voter_id);
    v_liked := true;
  end if;

  select count(*) into v_count
  from public.votes
  where object_type = p_object_type and object_id = p_object_id and action = 'like';

  return json_build_object('liked', v_liked, 'count', v_count);
end;
$$;

create or replace function public.count_likes(p_object_type text, p_object_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_count bigint;
begin
  select count(*) into v_count
  from public.votes
  where object_type = p_object_type and object_id = p_object_id and action = 'like';
  return json_build_object('count', v_count);
end;
$$;

-- aggregate "how much a collection is loved": asset votes + collection votes
create or replace function public.count_collection_likes(p_collection text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_count bigint;
begin
  select count(*) into v_count
  from public.votes
  where (action = 'like')
    and (object_id = p_collection or object_id in (
      select slug from public.assets where collection = p_collection
    ));
  return json_build_object('count', coalesce(v_count, 0));
end;
$$;

-- approved comments for an object (anonymous but clean surface)
create or replace function public.list_comments(
  p_object_type text,
  p_object_id   text,
  p_limit       int default 50
)
returns table(name text, text text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select c.name, c.text, c.created_at
  from public.comments c
  where c.object_type = p_object_type and c.object_id = p_object_id
    and c.status = 'approved'
  order by c.created_at asc
  limit greatest(1, least(p_limit, 200));
$$;

-- insert a comment into the moderation queue (rate-limited lightly)
create or replace function public.insert_comment(
  p_object_type text,
  p_object_id   text,
  p_voter_id    text,
  p_name        text,
  p_text        text,
  p_honeypot    text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_recent int; v_name text; v_text text;
begin
  if p_honeypot is not null and p_honeypot <> '' then
    raise exception 'spam';
  end if;
  if p_object_id is null or p_object_id = '' then
    raise exception 'bad object_id';
  end if;
  v_name := left(coalesce(nullif(btrim(p_name), ''), 'Guest'), 60);
  v_text := left(coalesce(nullif(btrim(p_text), ''), '...'), 1000);
  if v_text = '...' then raise exception 'empty comment'; end if;

  select count(*) into v_recent
  from public.comments
  where voter_id = p_voter_id and created_at > now() - interval '10 minutes';
  if v_recent >= 5 then raise exception 'slow down'; end if;

  insert into public.comments (object_type, object_id, voter_id, name, text)
  values (p_object_type, p_object_id, p_voter_id, v_name, v_text);

  return json_build_object('ok', true, 'moderation', true);
end;
$$;

-- archive/moderate (run from dashboard only; revoke execute from anon)
create or replace function public.moderate_comment(p_comment_id uuid, p_status text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('approved','rejected') then raise exception 'bad status'; end if;
  update public.comments set status = p_status where id = p_comment_id;
  return json_build_object('ok', true);
end;
$$;

-- insert a 1..10 style review (v1 compatible shape)
create or replace function public.insert_review(
  p_service smallint,
  p_needs   smallint,
  p_content smallint,
  p_name    text default '',
  p_comment text default '',
  p_voter_id text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_recent int;
begin
  if p_service not between 1 and 10 or p_needs not between 1 and 10 or p_content not between 1 and 10 then
    raise exception 'ratings must be 1..10';
  end if;

  select count(*) into v_recent
  from public.reviews
  where created_at > now() - interval '1 minute';
  if v_recent >= 3 then raise exception 'slow down'; end if;

  insert into public.reviews (nickname, comment, service, needs, content)
  values (
    left(coalesce(nullif(btrim(p_name), ''), 'Anonymous'), 40),
    left(coalesce(btrim(p_comment), ''), 2000),
    p_service, p_needs, p_content
  );

  return json_build_object('ok', true);
end;
$$;

create or replace function public.get_review_stats()
returns json
language sql
security definer
set search_path = public
as $$
  select row_to_json(r) from (select * from public.review_stats) r;
$$;

-- grants: anon may only execute RPCs / read the safe views
grant execute on function public.toggle_vote(text, text, text, text)           to anon, authenticated;
grant execute on function public.count_likes(text, text)                       to anon, authenticated;
grant execute on function public.count_collection_likes(text)                  to anon, authenticated;
grant execute on function public.list_comments(text, text, int)                to anon, authenticated;
grant execute on function public.insert_comment(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.insert_review(smallint, smallint, smallint, text, text, text) to anon, authenticated;
grant execute on function public.get_review_stats()                            to anon, authenticated;

revoke execute on function public.moderate_comment(uuid, text)                 from anon, authenticated;

-- assets metadata table (optional; holds classification/visibility overrides)
create table if not exists public.assets (
  slug          text primary key,
  collection    text not null,
  visibility    text not null default 'preview' check (visibility in ('preview','public','hidden')),
  blur_required boolean not null default true,
  title         text,
  updated_at    timestamptz not null default now()
);
alter table public.assets enable row level security;
grant select on public.assets to anon;