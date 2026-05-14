-- =============================================================================
-- Migration 002 — Enforce the email-domain allowlist at signup.
--
-- Until this runs, sign-in is gated only by the client (which is bypassable).
-- This makes it a hard server-side check: any attempt to sign in with an email
-- whose domain isn't in public.settings.allowed_email_domains will be rejected
-- by Postgres before the auth.users row is committed, which means Supabase
-- Auth surfaces the error back to the client.
--
-- Run this once in the Supabase SQL Editor after 001 has been applied.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local text := split_part(new.email, '@', 1);
  v_display text := coalesce(
    new.raw_user_meta_data ->> 'display_name',
    initcap(replace(v_local, '.', ' '))
  );
  v_domain text := lower(split_part(new.email, '@', 2));
  v_allowed text[];
  v_allowed_lower text[];
begin
  if v_domain is null or v_domain = '' then
    raise exception 'Sign-in requires a valid email address.';
  end if;

  -- Read the allowlist from the singleton settings row.
  select allowed_email_domains into v_allowed
    from public.settings where id = 1;

  -- If the allowlist is populated, the user's domain must be on it.
  -- An empty list (default) means "no restriction" — useful while you're
  -- setting things up. Populate via Admin → Allowed email domains before
  -- you share the URL.
  if v_allowed is not null and array_length(v_allowed, 1) > 0 then
    select array_agg(lower(trim(d))) into v_allowed_lower
      from unnest(v_allowed) as d;
    if not (v_domain = any (v_allowed_lower)) then
      raise exception
        'Sign-in is restricted to: %. Contact your admin if your domain should be added.',
        array_to_string(v_allowed_lower, ', ');
    end if;
  end if;

  insert into public.users (id, email, display_name)
  values (new.id, lower(new.email), v_display)
  on conflict (id) do nothing;
  return new;
end;
$$;
