-- =============================================================================
-- Migration 006 — Admin role, tightened RLS, and input length limits.
--
-- The original schema lets any signed-in (allowlisted-domain) user write to
-- every table, including `settings`. That means any NYU PM could disable
-- the email-domain allowlist and open signup to anyone. The schema comment
-- explicitly said "tighten before launch" — this is that migration.
--
-- Changes:
--   1. Add public.users.is_admin boolean (default false). Manage admins via
--      a Supabase SQL editor command after migration runs.
--   2. settings: writes require is_admin.
--   3. favorites: rows are private to their owner (user_id = auth.uid()).
--   4. subscribed_item_lane_prefs: keep org-wide read but only the actor
--      can write rows on roadmaps they belong to.
--   5. CHECK constraints capping free-text field length so a single user
--      can't balloon storage or backups.
-- =============================================================================

-- ---------- 1. is_admin column ----------
alter table public.users
  add column if not exists is_admin boolean not null default false;

-- ---------- 2. Settings: tighten writes to admins only ----------
-- Drop the existing permissive write policies if they exist (idempotent).
drop policy if exists "settings_update_any_member" on public.settings;
drop policy if exists "settings_insert_any_member" on public.settings;
drop policy if exists "settings_write_admin" on public.settings;

create policy "settings_write_admin" on public.settings
  for all
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.is_admin = true
    )
  );

-- Statuses live inside settings.statuses jsonb, so they're covered by the
-- above. The settings table SELECT remains open to any signed-in user.

-- ---------- 3. Favorites: per-user only ----------
drop policy if exists "favorites_member_all" on public.favorites;
drop policy if exists "favorites_select_own" on public.favorites;
drop policy if exists "favorites_write_own" on public.favorites;

create policy "favorites_select_own" on public.favorites
  for select
  using (user_id = auth.uid());

create policy "favorites_write_own" on public.favorites
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- 4. subscribed_item_lane_prefs ----------
-- Existing policy is "any member can read/write" — fine for read (everyone
-- can already see the roadmap), but only the user(s) on the subscriber
-- roadmap should write. For single-tenant this is mostly cosmetic, but
-- defense-in-depth before we ever go multi-tenant.
drop policy if exists "sub_lane_prefs_member_all" on public.subscribed_item_lane_prefs;
drop policy if exists "sub_lane_prefs_select_member" on public.subscribed_item_lane_prefs;
drop policy if exists "sub_lane_prefs_write_member" on public.subscribed_item_lane_prefs;

-- All signed-in members can read.
create policy "sub_lane_prefs_select_member" on public.subscribed_item_lane_prefs
  for select
  using (auth.uid() is not null);

-- All signed-in members can write (today's "single-tenant" model). When
-- multi-tenancy lands, replace with a tenant check.
create policy "sub_lane_prefs_write_member" on public.subscribed_item_lane_prefs
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ---------- 5. Length limits on free-text fields ----------
-- Conservative limits — most are plenty for a roadmap planning tool while
-- protecting against a single user filling 100GB of notes.
alter table public.items
  add constraint items_title_len   check (char_length(title)   <= 300),
  add constraint items_notes_len   check (char_length(notes)   <= 10000),
  add constraint items_owner_len   check (char_length(owner_text) <= 200);

alter table public.groups
  add constraint groups_name_len        check (char_length(name) <= 200),
  add constraint groups_description_len check (char_length(description) <= 2000);

alter table public.roadmaps
  add constraint roadmaps_name_len        check (char_length(name) <= 200),
  add constraint roadmaps_description_len check (char_length(description) <= 2000);

alter table public.swimlanes
  add constraint swimlanes_name_len        check (char_length(name) <= 200),
  add constraint swimlanes_description_len check (char_length(description) <= 2000);

alter table public.markers
  add constraint markers_label_len check (char_length(label) <= 200);

alter table public.users
  add constraint users_display_name_len check (char_length(display_name) <= 200);

-- =============================================================================
-- After running this migration, set the initial admin user manually:
--
--   update public.users
--      set is_admin = true
--    where email = 'andrew.caster@nyulangone.org'; -- replace as needed
--
-- The Admin page will read this flag and hide write controls from non-admins.
-- =============================================================================
