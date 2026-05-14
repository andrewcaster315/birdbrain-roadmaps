-- =============================================================================
-- Migration 003 — Fix infinite recursion in RLS policy for public.users.
--
-- The original is_member() helper queries public.users to check if the caller
-- is a known signed-in user. But the RLS SELECT policy on public.users also
-- calls is_member(). When the app reads from users, Postgres evaluates the
-- policy → calls is_member() → queries users → re-evaluates the policy → ...
-- The cycle errors out as a 500 from Supabase.
--
-- Fix: make is_member() SECURITY DEFINER so it runs as the function owner
-- (postgres) and bypasses RLS on its internal query.
-- =============================================================================

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.deleted_at is null
  )
$$;
