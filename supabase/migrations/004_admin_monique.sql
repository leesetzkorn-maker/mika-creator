-- =====================================================================
-- Mika Creator — migration 004: AUTHORIZE ADMIN (Monique)
-- Extends migration 002's public.admin_users / public.is_admin() so the
-- authorised admin account belongs to Monique (auth email:
-- mikacreator8@gmail.com).
--
-- SECURITY MODEL (server-side, same model as 002):
--   * Passwords NEVER appear in code or this repo. Sign-in uses Supabase
--     Auth: the client posts email+password to /auth/v1/token; the password
--     lives only in Supabase Auth (hashed) and is never stored or logged
--     by this project.
--   * Authorization is 100% server-side: every admin RPC is SECURITY
--     DEFINER and rejects unless public.is_admin() is true, which checks
--     the signed-in JWT email against public.admin_users.
--   * The ONLY privilege-escalation surface is this bootstrap function
--     (authorize_admin). It deliberately does NOT check is_admin() — it IS
--     the bootstrap. It is protected by: (a) EXECUTE granted ONLY to
--     service_role, (b) a hard REVOKE of admin_users from anon/authenticated,
--     and (c) it verifies the target email actually has a Supabase Auth
--     user before authorizing. A public visitor can never run it.
--   * No public signup mechanism for the admin is created.
--   * /admin/ is generated robots=noindex,nofollow and omitted from the
--     sitemap.
--
-- HOW TO AUTHORIZE MONIQUE (after this migration + its dependencies 002/003
-- have been applied):
--   Supabase Dashboard -> SQL Editor -> run:
--     select public.authorize_admin('mikacreator8@gmail.com', 'Monique');
--   (idempotent — safe to re-run. If the Auth user for that email does not
--   exist yet, the function raises a clear error; create it under
--   Authentication > Users first, and confirm the activation email.)
--
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Metadata columns (optional, purely for readability)
-- ---------------------------------------------------------------------
alter table public.admin_users add column if not exists name text not null default 'Monique';
alter table public.admin_users add column if not exists authorized_at timestamptz not null default now();

-- ---------------------------------------------------------------------
-- 2. AUTHORIZE helper (canonical name — matches the supported call)
--    Verifies the Auth user exists, then upserts the admin mapping.
-- ---------------------------------------------------------------------
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

  -- Only ever authorize a real auth account — no orphan admin rows.
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

-- Alias for compatibility with the earlier draft name (004 v1).
create or replace function public.admin_authorize_admin(p_email text, p_name text default null)
returns json
language sql
security definer
set search_path = public
as $$
  select public.authorize_admin(p_email, p_name);
$$;

-- ---------------------------------------------------------------------
-- 3. REVOKE helper + alias  (remove an admin by email)
-- ---------------------------------------------------------------------
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

create or replace function public.admin_revoke_admin(p_email text)
returns json
language sql
security definer
set search_path = public
as $$
  select public.revoke_admin(p_email);
$$;

-- ---------------------------------------------------------------------
-- 4. Privilege lockdown (defence in depth on top of RLS)
-- ---------------------------------------------------------------------
revoke all on public.admin_users from anon;
revoke all on public.admin_users from authenticated;

grant execute on function public.authorize_admin(text, text) to service_role;
grant execute on function public.admin_authorize_admin(text, text) to service_role;
grant execute on function public.revoke_admin(text) to service_role;
grant execute on function public.admin_revoke_admin(text) to service_role;

commit;

-- =====================================================================
-- DONE. Run the authorize one-liner from the header to grant Monique.
-- Emails / passwords are never in the repo. No admin password is created
-- here — it is set once in Authentication > Users.
-- =====================================================================