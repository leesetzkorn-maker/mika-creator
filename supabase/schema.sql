-- =====================================================================
-- Mika Creator – Supabase schema
-- Global likes (votes) + comments/reviews persistence
--
-- HOW TO RUN: open your Supabase Dashboard -> SQL Editor -> New query,
-- paste this whole file, and click "Run". Safe to run again (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Votes (global like / dislike per gallery photo)
--    record_key format: "<Category>|<index>"  e.g. "Mountain|0"
-- ---------------------------------------------------------------------
create table if not exists public.votes (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  record_key  text not null,
  action      text not null constraint votes_action_check check (action in ('like','dislike')),
  voter_id    text not null,
  constraint votes_record_voter_unique unique (record_key, voter_id)
);

create index if not exists votes_record_idx on public.votes (record_key);

-- ---------------------------------------------------------------------
-- 2. Reviews (client ratings + optional comment under a nickname)
--    Ratings are 1..10 to match the existing 10-star UI.
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

-- ---------------------------------------------------------------------
-- 3. Row Level Security
--    Public (anon) users may READ everything and may INSERT reviews.
--    Likes are ONLY changed through the toggle_vote() function below,
--    so nobody can spam or overwrite someone else's vote.
-- ---------------------------------------------------------------------
alter table public.votes   enable row level security;
alter table public.reviews enable row level security;

drop policy if exists "votes_read_all" on public.votes;
create policy "votes_read_all" on public.votes
  for select using (true);

drop policy if exists "reviews_read_all" on public.reviews;
create policy "reviews_read_all" on public.reviews
  for select using (true);

drop policy if exists "reviews_insert_all" on public.reviews;
create policy "reviews_insert_all" on public.reviews
  for insert with check (true);

-- Base grants for the anon role
grant usage on schema public to anon;
grant select on public.votes to anon;
grant select, insert on public.reviews to anon;

-- ---------------------------------------------------------------------
-- 4. toggle_vote() – the single place a like/dislike can be toggled.
--    Runs as the table owner (SECURITY DEFINER) so it can enforce the
--    "one vote per visitor per photo" rule atomically.
--
--    behaviour:
--      - no existing vote  -> adds   (returns status 'added')
--      - same action again -> removes (returns status 'removed')
--      - opposite action   -> switches (returns status 'switched')
-- ---------------------------------------------------------------------
create or replace function public.toggle_vote(
  p_record_key text,
  p_action     text,
  p_voter_id   text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.votes;
begin
  if p_action not in ('like','dislike') then
    raise exception 'invalid action (must be like or dislike)';
  end if;
  if p_voter_id is null or p_voter_id = '' then
    raise exception 'missing voter id';
  end if;

  select * into v
  from public.votes
  where record_key = p_record_key and voter_id = p_voter_id
  limit 1;

  if not found then
    insert into public.votes (record_key, action, voter_id)
    values (p_record_key, p_action, p_voter_id)
    returning * into v;
    return json_build_object(
      'status', 'added',
      'id', v.id,
      'record_key', v.record_key,
      'action', v.action,
      'voter_id', v.voter_id
    );
  end if;

  if v.action = p_action then
    delete from public.votes where id = v.id;
    return json_build_object(
      'status', 'removed',
      'id', v.id,
      'record_key', v.record_key
    );
  end if;

  update public.votes set action = p_action where id = v.id returning * into v;
  return json_build_object(
    'status', 'switched',
    'id', v.id,
    'record_key', v.record_key,
    'action', v.action,
    'voter_id', v.voter_id
  );
end;
$$;

grant execute on function public.toggle_vote(text, text, text) to anon, authenticated;