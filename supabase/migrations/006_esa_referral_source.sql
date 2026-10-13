-- Mika Creator: classify referrals from ESA (Escort South Africa).
-- This changes no existing data, photos, content, layout or customer records.
-- Run this migration in the linked Supabase project to update the server-side
-- traffic-source report; the client-side source tracking is already deployed.
create or replace function public.lead_source(
  p_referrer text,
  p_extra jsonb default '{}'::jsonb
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(p_extra ->> 'utm_source', '')) = 'esa'
      then 'ESA'
    when lower(coalesce(p_extra ->> 'utm_source', '')) in
      ('tiktok','facebook','instagram','reddit','google','telegram','twitter','snapchat','youtube','whatsapp')
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
    when lower(coalesce(p_extra ->> 'utm_source', '')) <> ''
      then 'Other'
    when lower(coalesce(p_extra ->> 'source', '')) = 'esa'
      then 'ESA'
    when p_referrer ilike '%esa.co.za%'
      then 'ESA'
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
