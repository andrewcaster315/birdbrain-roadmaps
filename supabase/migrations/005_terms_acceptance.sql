-- =============================================================================
-- Migration 005 — Record user acceptance of Privacy Policy + Terms of Use.
--
-- Stores the version string the user accepted (matches the "Last updated"
-- date on the Legal pages) and the timestamp at which they accepted. A null
-- value means the user has never accepted; the app will prompt them on next
-- page load. When a material update is made to the Terms, bump the
-- CURRENT_TERMS_VERSION constant in src/types.ts — users whose stored value
-- no longer matches will be re-prompted.
-- =============================================================================

alter table public.users
  add column if not exists terms_version_accepted text,
  add column if not exists terms_accepted_at timestamptz;
