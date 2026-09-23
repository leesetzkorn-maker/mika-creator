-- =====================================================================
-- Mika Creator — migration 003: LEADS & CONVERSIONS
-- Extends migration 002 (analytics_events + admin). Idempotent: safe to re-run.
--
-- WHAT THIS DOES:
--   1. Expands analytics_events event_type list for the conversion funnel
--      (session_start, hero_slide_view, gallery_open, collection_open,
--       whatsapp_click, telegram_click, pricing_view, custom_request_click,
--       generate_lead) — every existing event type is preserved.
--   2. Replaces insert_event (same signature, no frontend change needed) so
--      conversion clicks AUTO-CREATE a "potential lead" in public.leads
--      (deduped per visitor + channel + collection within 24h).
--      A WhatsApp / Telegram click is ONLY ever a potential lead — the owner
--      manually promotes a lead to PAID / CUSTOMER in the dashboard.
--   3. Creates public.leads
--         status: new / contacted / interested / paid / completed / lost
--   4. Creates public.customers (manual revenue entries; admin-only)
--         status: paid / completed / refunded  (refunded rows never count as revenue)
--   5. Adds admin RPCs:
--        admin_get_conversions      funnel (today / 7d / 28d) + source report +
--                                   page/collection conversion report + lists
--        admin_create_lead / admin_update_lead_status / admin_list_leads / admin_delete_lead
--        admin_add_customer / admin_list_customers / admin_delete_customer
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste this entire file -> Run.
-- Requires migration 002 already applied (analytics_events must exist).
-- =====================================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. EXPAND analytics_events event_type list
--    Drops ANY check constraint on the table that mentions event_type, so it
--    works regardless of the auto-generated constraint name from migration 002.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    where cls.relname = 'analytics_events'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%event_type%'
  loop
    execute format('alter table public.analytics_events drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.analytics_events add constraint analytics_events_event_type_check
  check (event_type in (
    'page_view','session_start','hero_slide_view',
    'gallery_open','collection_open',
    'cta_click','whatsapp_click','telegram_click','contact_click',
    'pricing_view','custom_request_click','generate_lead',
    'outbound_click','like','review_submit','gallery_interaction',
    'redvelvet_click','esa_click'
  ));

-- ---------------------------------------------------------------------
-- 2. SOURCE DERIVATION HELPER
--    Turns a UTM source (or referrer fallback) into a stable bucket that the
--    dashboard reports on. Never invents data: no utm + no referrer = Direct.
-- ---------------------------------------------------------------------
create or replace function public.lead_source(p_referrer text, p_extra jsonb default '{}')
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(p_extra ->> 'utm_source', '')) in ('tiktok','facebook','instagram','reddit','google','telegram','twitter','snapchat','youtube','whatsapp')
      then (select case lower(coalesce(p_extra ->> 'utm_source', ''))
                when 'tiktok' then 'TikTok'
                when 'facebook' then 'Facebook'
                when 'instagram' then 'Instagram'
                when 'reddit' then 'Reddit'
                when 'google' then 'Google'
                when 'telegram' then 'Telegram'
                when 'twitter' then 'Twitter'
                when 'snapchat' then 'Snapchat'
                when 'youtube' then 'YouTube'
                when 'whatsapp' then 'WhatsApp'
              end)
    when lower(coalesce(p_extra ->> 'utm_source', '')) <> '' then 'Other'
    when p_referrer is null or p_referrer = '' then 'Direct'
    when p_referrer ilike '%tiktok%' then 'TikTok'
    when p_referrer ilike '%facebook%' or p_referrer ilike '%fb.com%' then 'Facebook'
    when p_referrer ilike '%instagram%' then 'Instagram'
    when p_referrer ilike '%reddit%' then 'Reddit'
    when p_referrer ilike '%google%' then 'Google'
    when p_referrer ilike '%telegram%' or p_referrer ilike '%t.me%' then 'Telegram'
    when p_referrer ilike '%twitter%' or p_referrer ilike '%x.com%' then 'Twitter'
    else 'Other'
  end;
$$;

-- ---------------------------------------------------------------------
-- 3. LEADS TABLE  (private — no anon/authenticated access)
-- ---------------------------------------------------------------------
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

create index if not exists leads_status_idx on public.leads (status, created_at);
create index if not exists leads_source_idx on public.leads (source, created_at);
create index if not exists leads_created_idx on public.leads (created_at);

alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. CUSTOMERS TABLE  (manual revenue entries; private — admin only)
-- ---------------------------------------------------------------------
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

create index if not exists customers_date_idx on public.customers (entry_date, created_at);
create index if not exists customers_status_idx on public.customers (status, created_at);

alter table public.customers enable row level security;
revoke all on public.customers from anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. INSERT EVENT  (replaces migration-002 version; same signature)
--    Auto-creates a potential lead when event_type is a conversion click.
-- ---------------------------------------------------------------------
create or replace function public.insert_event(
  p_event_type text,
  p_path       text default '/',
  p_referrer   text default '',
  p_device     text default 'unknown',
  p_ua_hash    text default '',
  p_extra      jsonb default '{}'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_recent int;
        v_channel text;
        v_collection text;
begin
  if p_event_type not in (
    'page_view','session_start','hero_slide_view',
    'gallery_open','collection_open',
    'cta_click','whatsapp_click','telegram_click','contact_click',
    'pricing_view','custom_request_click','generate_lead',
    'outbound_click','like','review_submit','gallery_interaction',
    'redvelvet_click','esa_click'
  ) then
    raise exception 'bad event_type';
  end if;

  -- rate limit: max 30 events per minute per UA hash
  if p_ua_hash is not null and p_ua_hash <> '' then
    select count(*) into v_recent
    from public.analytics_events
    where ua_hash = p_ua_hash and created_at > now() - interval '1 minute';
    if v_recent >= 30 then
      raise exception 'rate limited';
    end if;
  end if;

  insert into public.analytics_events (event_type, path, referrer, device, ua_hash, extra)
  values (p_event_type, left(p_path, 500), left(p_referrer, 500), left(p_device, 20), left(p_ua_hash, 64), coalesce(p_extra, '{}'));

  -- Potential lead (NEW). A click is never a customer by itself — the owner
  -- promotes a lead to PAID / adds a customer row manually. Deduped per
  -- visitor + channel + collection within 24h so the lead board stays clean.
  if p_ua_hash is not null and p_ua_hash <> ''
     and p_event_type in ('whatsapp_click', 'telegram_click', 'generate_lead') then
    v_channel := case p_event_type
      when 'whatsapp_click' then 'whatsapp'
      when 'telegram_click' then 'telegram'
      else 'custom' end;
    v_collection := coalesce(nullif(p_extra ->> 'collection', ''), '');

    if not exists (
      select 1 from public.leads l
      where l.ua_hash = p_ua_hash
        and l.channel = v_channel
        and coalesce(l.collection, '') = v_collection
        and l.status = 'new'
        and l.created_at > now() - interval '24 hours'
    ) then
      insert into public.leads (ua_hash, source, campaign, collection, page_path, channel, status)
      values (
        left(p_ua_hash, 64),
        public.lead_source(p_referrer, p_extra),
        left(coalesce(nullif(p_extra ->> 'utm_campaign', ''), ''), 120),
        left(v_collection, 120),
        left(p_path, 500),
        v_channel,
        'new'
      );
    end if;
  end if;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.insert_event(text, text, text, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. ADMIN — LEAD MANAGEMENT
-- ---------------------------------------------------------------------
create or replace function public.admin_create_lead(
  p_source     text default 'Direct',
  p_campaign   text default '',
  p_collection text default '',
  p_page_path  text default '',
  p_channel    text default 'manual',
  p_note       text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  if p_channel not in ('whatsapp','telegram','email','custom','manual') then raise exception 'bad channel'; end if;

  insert into public.leads (ua_hash, source, campaign, collection, page_path, channel, note, status)
  values ('',
    left(coalesce(nullif(btrim(p_source), ''), 'Direct'), 40),
    left(coalesce(nullif(btrim(p_campaign), ''), ''), 120),
    left(coalesce(nullif(btrim(p_collection), ''), ''), 120),
    left(coalesce(nullif(btrim(p_page_path), ''), ''), 500),
    p_channel,
    left(coalesce(nullif(btrim(p_note), ''), ''), 500),
    'new')
  returning id into v_id;

  return json_build_object('id', v_id, 'ok', true);
end;
$$;

create or replace function public.admin_update_lead_status(
  p_lead_id bigint,
  p_status  text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  if p_status not in ('new','contacted','interested','paid','completed','lost') then raise exception 'bad status'; end if;

  update public.leads set status = p_status, updated_at = now() where id = p_lead_id;
  if not found then raise exception 'not found'; end if;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_delete_lead(p_lead_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  delete from public.leads where id = p_lead_id;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_list_leads(
  p_status text default 'all',
  p_limit  int default 50
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;

  return (select coalesce(json_agg(l order by l.created_at desc), '[]'::json)
  from (
    select id, created_at, updated_at, source, campaign, collection, page_path, channel, status, note
    from public.leads
    where (p_status = 'all' or status = p_status)
    order by created_at desc
    limit greatest(1, least(p_limit, 300))
  ) l);
end;
$$;

-- ---------------------------------------------------------------------
-- 7. ADMIN — CUSTOMERS / REVENUE
-- ---------------------------------------------------------------------
create or replace function public.admin_add_customer(
  p_entry_date date default current_date,
  p_source     text default '',
  p_campaign   text default '',
  p_collection text default '',
  p_product    text default '',
  p_amount     numeric default 0,
  p_status     text default 'paid',
  p_note       text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  if p_status not in ('paid','completed','refunded') then raise exception 'bad status'; end if;
  if coalesce(p_amount, 0) < 0 then raise exception 'bad amount'; end if;

  insert into public.customers (entry_date, source, campaign, collection, product, amount, status, note)
  values (
    coalesce(p_entry_date, current_date),
    left(coalesce(nullif(btrim(p_source), ''), ''), 40),
    left(coalesce(nullif(btrim(p_campaign), ''), ''), 120),
    left(coalesce(nullif(btrim(p_collection), ''), ''), 120),
    left(coalesce(nullif(btrim(p_product), ''), ''), 120),
    coalesce(p_amount, 0),
    p_status,
    left(coalesce(nullif(btrim(p_note), ''), ''), 500))
  returning id into v_id;

  return json_build_object('id', v_id, 'ok', true);
end;
$$;

create or replace function public.admin_list_customers(p_limit int default 100)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;

  return (select coalesce(json_agg(c order by c.entry_date desc, c.created_at desc), '[]'::json)
  from (
    select id, created_at, entry_date, source, campaign, collection, product, amount, status, note
    from public.customers
    order by entry_date desc, created_at desc
    limit greatest(1, least(p_limit, 500))
  ) c);
end;
$$;

create or replace function public.admin_delete_customer(p_customer_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;
  delete from public.customers where id = p_customer_id;
  return json_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. ADMIN — FUNNEL / SOURCE / PAGE CONVERSION REPORT
-- ---------------------------------------------------------------------
create or replace function public._funnel_block(p_from timestamptz)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;

  return json_build_object(
    'visitors',        (select count(distinct ua_hash) from public.analytics_events where event_type = 'page_view' and created_at >= p_from),
    'page_views',      (select count(*) from public.analytics_events where event_type = 'page_view' and created_at >= p_from),
    'gallery_opens',   (select count(*) from public.analytics_events where event_type in ('gallery_open','collection_open') and created_at >= p_from),
    'whatsapp_clicks', (select count(*) from public.analytics_events where event_type = 'whatsapp_click' and created_at >= p_from),
    'telegram_clicks', (select count(*) from public.analytics_events where event_type = 'telegram_click' and created_at >= p_from),
    'leads',           (select count(*) from public.leads where created_at >= p_from),
    'customers',       (select count(*) from public.customers where status <> 'refunded' and (created_at >= p_from or entry_date >= p_from::date)),
    'revenue',         (select coalesce(sum(amount), 0) from public.customers where status <> 'refunded' and (created_at >= p_from or entry_date >= p_from::date)),
    'conversion_rate', (
      select case when v.v = 0 then 0 else round(100.0 * l.l / v.v, 1) end
      from (select count(distinct ua_hash) v from public.analytics_events where event_type = 'page_view' and created_at >= p_from) v,
           (select count(*) l from public.leads where created_at >= p_from) l
    )
  );
end;
$$;

create or replace function public.admin_get_conversions()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_7d  timestamptz := now() - interval '7 days';
        v_28d timestamptz := now() - interval '28 days';
begin
  if not public.is_admin() then raise exception 'unauthorized'; end if;

  return json_build_object(
    'today',  public._funnel_block(date_trunc('day', now())),
    'last7',  public._funnel_block(v_7d),
    'last28', public._funnel_block(v_28d),

    -- Traffic source report (last 28 days). Zero rows are always returned — never invented.
    'sources', (select coalesce(json_agg(r order by r.visitors desc, r.whatsapp_clicks desc), '[]'::json)
      from (
        select s.src as source,
               coalesce(vis.visitors, 0) as visitors,
               coalesce(wa.clicks, 0) as whatsapp_clicks,
               coalesce(ld.leads, 0) as leads,
               round(100.0 * coalesce(ld.leads, 0) / nullif(coalesce(vis.visitors, 0), 0), 1) as conversion_rate
        from (values ('TikTok'),('Facebook'),('Instagram'),('Reddit'),('Google'),('Telegram'),('WhatsApp'),('Twitter'),('Snapchat'),('YouTube'),('Direct'),('Other')) as s(src)
        left join (
          select public.lead_source(referrer, extra) as source, count(distinct ua_hash) as visitors
          from public.analytics_events
          where event_type = 'page_view' and created_at >= v_28d
          group by 1
        ) vis on vis.source = s.src
        left join (
          select public.lead_source(referrer, extra) as source, count(*) as clicks
          from public.analytics_events
          where event_type = 'whatsapp_click' and created_at >= v_28d
          group by 1
        ) wa on wa.source = s.src
        left join (
          select source, count(*) as leads from public.leads where created_at >= v_28d group by 1
        ) ld on ld.source = s.src
      ) r),

    -- Page / collection conversion report (last 28 days).
    'pages', (select coalesce(json_agg(r order by r.visitors desc, r.views desc), '[]'::json)
      from (
        with keys as (
          select path, '' as collection from public.analytics_events where event_type = 'page_view' and created_at >= v_28d
          union
          select path, coalesce(extra ->> 'collection', '') from public.analytics_events where event_type in ('gallery_open','collection_open') and created_at >= v_28d
          union
          select path, coalesce(extra ->> 'collection', '') from public.analytics_events where event_type = 'whatsapp_click' and created_at >= v_28d
        ),
        pv as (select path, count(*) views, count(distinct ua_hash) visitors from public.analytics_events where event_type = 'page_view' and created_at >= v_28d group by 1),
        op as (select path, coalesce(extra ->> 'collection', '') c, count(*) opens from public.analytics_events where event_type in ('gallery_open','collection_open') and created_at >= v_28d group by 1, 2),
        wa as (select path, coalesce(extra ->> 'collection', '') c, count(*) clicks from public.analytics_events where event_type = 'whatsapp_click' and created_at >= v_28d group by 1, 2),
        ld as (select page_path, count(*) leads from public.leads where created_at >= v_28d group by 1)
        select k.path,
               coalesce(nullif(k.collection, ''), k.path) as label,
               k.collection,
               coalesce(pv.visitors, 0) as visitors,
               coalesce(pv.views, 0) as views,
               coalesce(op.opens, 0) as gallery_opens,
               coalesce(wa.clicks, 0) as whatsapp_clicks,
               coalesce(ld.leads, 0) as leads
        from keys k
        left join pv on pv.path = k.path
        left join op on op.path = k.path and op.c = k.collection
        left join wa on wa.path = k.path and wa.c = k.collection
        left join ld on ld.page_path = k.path
      ) r),

    'recent_leads', (select coalesce(json_agg(l order by l.created_at desc), '[]'::json)
      from (select id, created_at, source, campaign, collection, page_path, channel, status, note
            from public.leads order by created_at desc limit 30) l),

    'recent_customers', (select coalesce(json_agg(c order by c.entry_date desc, c.created_at desc), '[]'::json)
      from (select id, created_at, entry_date, source, campaign, collection, product, amount, status, note
            from public.customers order by entry_date desc, created_at desc limit 30) c)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 9. GRANTS
-- ---------------------------------------------------------------------
grant execute on function public.admin_create_lead(text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_update_lead_status(bigint, text) to authenticated;
grant execute on function public.admin_list_leads(text, int) to authenticated;
grant execute on function public.admin_delete_lead(bigint) to authenticated;
grant execute on function public.admin_add_customer(date, text, text, text, text, numeric, text, text) to authenticated;
grant execute on function public.admin_list_customers(int) to authenticated;
grant execute on function public.admin_delete_customer(bigint) to authenticated;
grant execute on function public.admin_get_conversions() to authenticated;

-- =====================================================================
-- DONE. After running:
--   * anon can still insert analytics events (unchanged)
--   * conversion clicks now auto-create leads with status NEW
--   * sign in at /admin/ with Mika's admin account to see LEADS & CONVERSIONS
-- =====================================================================
commit;