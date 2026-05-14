-- =============================================================================
-- Internal Roadmapping Tool — Initial schema (v7, single-tenant)
-- Run this once in Supabase SQL Editor (Project → SQL → New query → paste → Run).
-- It is idempotent at the DDL level: re-running is harmless except for the
-- seed INSERT at the bottom (which uses ON CONFLICT DO NOTHING).
-- =============================================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ---------- Helpers ----------
create or replace function public.now_iso() returns timestamptz
  language sql immutable as $$ select now() $$;

-- ---------- Settings (singleton: id = 1 always) ----------
create table if not exists public.settings (
  id integer primary key default 1 check (id = 1),
  fiscal_year_start_month integer not null default 1 check (fiscal_year_start_month between 1 and 12),
  allowed_email_domains text[] not null default '{}',
  -- statuses are stored as a JSON array of { id, name, color, position }
  statuses jsonb not null default '[
    {"id":"planned",     "name":"Planned",     "color":"#64748b","position":0},
    {"id":"in_progress", "name":"In Progress", "color":"#2563eb","position":1},
    {"id":"done",        "name":"Done",        "color":"#047857","position":2},
    {"id":"on_hold",     "name":"On Hold",     "color":"#b45309","position":3},
    {"id":"cancelled",   "name":"Cancelled",   "color":"#4b5563","position":4}
  ]'::jsonb,
  org_name text not null default 'Roadmaps',
  updated_at timestamptz not null default now()
);

-- ---------- Users (mirror of auth.users) ----------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists users_email_idx on public.users (lower(email));

-- Auto-create a public.users row when a new auth.users row appears.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_local text := split_part(new.email, '@', 1);
  v_display text := coalesce(
    new.raw_user_meta_data ->> 'display_name',
    initcap(replace(v_local, '.', ' '))
  );
begin
  insert into public.users (id, email, display_name)
  values (new.id, lower(new.email), v_display)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Groups ----------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  parent_group_id uuid references public.groups (id) on delete set null,
  created_by_id uuid references public.users (id) on delete set null,
  updated_by_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists groups_name_unique
  on public.groups (lower(name))
  where deleted_at is null;

-- ---------- Roadmaps ----------
create table if not exists public.roadmaps (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null,
  description text not null default '',
  timeline_granularity text not null default 'months'
    check (timeline_granularity in ('weeks','months','quarters')),
  quarter_mode text not null default 'CY' check (quarter_mode in ('CY','FY')),
  created_by_id uuid references public.users (id) on delete set null,
  updated_by_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists roadmaps_group_idx on public.roadmaps (group_id) where deleted_at is null;

-- ---------- Swimlanes ----------
create table if not exists public.swimlanes (
  id uuid primary key default gen_random_uuid(),
  roadmap_id uuid not null references public.roadmaps (id) on delete cascade,
  name text not null,
  description text not null default '',
  position integer not null default 0,
  created_by_id uuid references public.users (id) on delete set null,
  updated_by_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists swimlanes_roadmap_idx on public.swimlanes (roadmap_id, position);

-- ---------- Items ----------
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  home_roadmap_id uuid not null references public.roadmaps (id) on delete cascade,
  title text not null,
  status text not null default 'Planned',
  owner_id uuid references public.users (id) on delete set null,
  owner_text text not null default '',
  notes text not null default '',
  start_date date,
  end_date date,
  depends_on_item_ids uuid[] not null default '{}',
  priority integer not null default 1,
  created_by_id uuid references public.users (id) on delete set null,
  updated_by_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (start_date is null or end_date is null or start_date <= end_date)
);

create index if not exists items_home_idx on public.items (home_roadmap_id) where deleted_at is null;
create index if not exists items_priority_idx on public.items (home_roadmap_id, priority) where deleted_at is null;

-- ---------- Placements (direct manual / home placements) ----------
create table if not exists public.placements (
  roadmap_id uuid not null references public.roadmaps (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  swimlane_id uuid references public.swimlanes (id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (roadmap_id, item_id)
);

create index if not exists placements_item_idx on public.placements (item_id);

-- ---------- Subscribed-item lane preferences ----------
-- Per-(subscriber_roadmap, item) swimlane override for items arriving via
-- subscription, so a director can park them in their own lanes without
-- affecting the source roadmap.
create table if not exists public.subscribed_item_lane_prefs (
  subscriber_roadmap_id uuid not null references public.roadmaps (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  swimlane_id uuid references public.swimlanes (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (subscriber_roadmap_id, item_id)
);

-- ---------- Roadmap subscriptions ----------
create table if not exists public.roadmap_subscriptions (
  subscriber_roadmap_id uuid not null references public.roadmaps (id) on delete cascade,
  subscribed_roadmap_id uuid not null references public.roadmaps (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (subscriber_roadmap_id, subscribed_roadmap_id),
  check (subscriber_roadmap_id <> subscribed_roadmap_id)
);

create index if not exists subscriptions_target_idx on public.roadmap_subscriptions (subscribed_roadmap_id);

-- ---------- Favorites ----------
create table if not exists public.favorites (
  user_id uuid not null references public.users (id) on delete cascade,
  roadmap_id uuid not null references public.roadmaps (id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, roadmap_id)
);

-- ---------- Markers ----------
create table if not exists public.markers (
  id uuid primary key default gen_random_uuid(),
  roadmap_id uuid not null references public.roadmaps (id) on delete cascade,
  date date not null,
  label text not null default '',
  color text not null,
  created_by_id uuid references public.users (id) on delete set null,
  updated_by_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists markers_roadmap_idx on public.markers (roadmap_id, date);

-- ---------- Audit log ----------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  entity_id uuid not null,
  action text not null check (action in ('created','updated','deleted','restored')),
  changes jsonb,
  summary text not null default '',
  actor_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists audit_entity_idx on public.audit_log (entity, entity_id, created_at desc);
create index if not exists audit_recent_idx on public.audit_log (created_at desc);

-- ---------- Generic audit trigger ----------
-- Writes a row to audit_log on every INSERT / UPDATE / DELETE. Pass two args:
--   tg_argv[0] = entity name (e.g. 'item', 'group', 'roadmap')
--   tg_argv[1] = jsonb path to display name (e.g. 'title' for items, 'name' for groups)
create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_entity text := tg_argv[0];
  v_name_field text := coalesce(tg_argv[1], 'name');
  v_action text;
  v_entity_id uuid;
  v_changes jsonb;
  v_summary text;
  v_label text;
begin
  if tg_op = 'INSERT' then
    v_action := 'created';
    v_entity_id := new.id;
    v_label := coalesce(to_jsonb(new) ->> v_name_field, v_entity);
    v_summary := 'Created "' || v_label || '"';
  elsif tg_op = 'UPDATE' then
    v_entity_id := new.id;
    v_label := coalesce(to_jsonb(new) ->> v_name_field, v_entity);
    if new.deleted_at is not null and old.deleted_at is null then
      v_action := 'deleted';
      v_summary := 'Deleted "' || v_label || '"';
    elsif new.deleted_at is null and old.deleted_at is not null then
      v_action := 'restored';
      v_summary := 'Restored "' || v_label || '"';
    else
      v_action := 'updated';
      v_summary := 'Updated "' || v_label || '"';
      -- field-level diff, ignoring audit metadata
      select jsonb_object_agg(key, jsonb_build_object('from', oldval, 'to', newval))
        into v_changes
        from (
          select key, oldval, newval
            from (select * from jsonb_each(to_jsonb(old))) o(key, oldval)
            join (select * from jsonb_each(to_jsonb(new))) n(key, newval) using (key)
           where oldval is distinct from newval
             and key not in ('updated_at','updated_by_id')
        ) diff;
    end if;
  elsif tg_op = 'DELETE' then
    v_action := 'deleted';
    v_entity_id := old.id;
    v_label := coalesce(to_jsonb(old) ->> v_name_field, v_entity);
    v_summary := 'Deleted "' || v_label || '"';
  end if;

  insert into public.audit_log (entity, entity_id, action, changes, summary, actor_id)
  values (v_entity, v_entity_id, v_action, v_changes, v_summary, auth.uid());

  return coalesce(new, old);
end;
$$;

-- Attach the trigger to each audited table.
drop trigger if exists audit_items on public.items;
create trigger audit_items
  after insert or update or delete on public.items
  for each row execute function public.write_audit_log('item', 'title');

drop trigger if exists audit_groups on public.groups;
create trigger audit_groups
  after insert or update or delete on public.groups
  for each row execute function public.write_audit_log('group', 'name');

drop trigger if exists audit_roadmaps on public.roadmaps;
create trigger audit_roadmaps
  after insert or update or delete on public.roadmaps
  for each row execute function public.write_audit_log('roadmap', 'name');

drop trigger if exists audit_swimlanes on public.swimlanes;
create trigger audit_swimlanes
  after insert or update or delete on public.swimlanes
  for each row execute function public.write_audit_log('swimlane', 'name');

drop trigger if exists audit_markers on public.markers;
create trigger audit_markers
  after insert or update or delete on public.markers
  for each row execute function public.write_audit_log('marker', 'label');

-- ---------- updated_at trigger ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['users','groups','roadmaps','swimlanes','items','markers','settings']
  loop
    execute format('drop trigger if exists tg_touch_%I on public.%I', t, t);
    execute format(
      'create trigger tg_touch_%I before update on public.%I for each row execute function public.touch_updated_at()',
      t, t
    );
  end loop;
end$$;

-- =============================================================================
-- Row Level Security
-- All authenticated users can read/write all rows. The "read-only on non-home
-- roadmaps" rule is enforced in the UI, not at the database — RLS has no way
-- to know which roadmap a user is currently viewing.
--
-- BEFORE LAUNCH: run the security checklist in Requirements_v7.docx §10,
-- especially the curl-with-no-JWT test against every table.
-- =============================================================================

alter table public.settings                     enable row level security;
alter table public.users                        enable row level security;
alter table public.groups                       enable row level security;
alter table public.roadmaps                     enable row level security;
alter table public.swimlanes                    enable row level security;
alter table public.items                        enable row level security;
alter table public.placements                   enable row level security;
alter table public.subscribed_item_lane_prefs   enable row level security;
alter table public.roadmap_subscriptions        enable row level security;
alter table public.favorites                    enable row level security;
alter table public.markers                      enable row level security;
alter table public.audit_log                    enable row level security;

-- A helper: "is this caller a known signed-in user in the users table?"
create or replace function public.is_member()
returns boolean language sql stable as $$
  select exists (select 1 from public.users u where u.id = auth.uid() and u.deleted_at is null)
$$;

-- Generic permissive policies for org members on the data tables.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'groups','roadmaps','swimlanes','items','placements',
    'subscribed_item_lane_prefs','roadmap_subscriptions','favorites','markers'
  ]
  loop
    execute format('drop policy if exists "members read"   on public.%I', tbl);
    execute format('drop policy if exists "members write"  on public.%I', tbl);
    execute format('drop policy if exists "members update" on public.%I', tbl);
    execute format('drop policy if exists "members delete" on public.%I', tbl);

    execute format('create policy "members read"   on public.%I for select        to authenticated using (public.is_member())', tbl);
    execute format('create policy "members write"  on public.%I for insert        to authenticated with check (public.is_member())', tbl);
    execute format('create policy "members update" on public.%I for update        to authenticated using (public.is_member()) with check (public.is_member())', tbl);
    execute format('create policy "members delete" on public.%I for delete        to authenticated using (public.is_member())', tbl);
  end loop;
end$$;

-- Users table: every member can read everyone; each user can update only their own row.
drop policy if exists "members read users"    on public.users;
drop policy if exists "users update self"     on public.users;
create policy "members read users" on public.users
  for select to authenticated using (public.is_member());
create policy "users update self" on public.users
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Settings: members read; only an admin can write. There's no admin role yet,
-- so for v1 we let any member write. Tighten before launching to PMs.
drop policy if exists "members read settings"  on public.settings;
drop policy if exists "members write settings" on public.settings;
create policy "members read settings"  on public.settings for select to authenticated using (public.is_member());
create policy "members write settings" on public.settings for update to authenticated using (public.is_member()) with check (public.is_member());

-- Audit log: members can read; writes happen exclusively via the trigger
-- function (which runs as SECURITY DEFINER), not via direct API. So no
-- INSERT/UPDATE/DELETE policy is created.
drop policy if exists "members read audit" on public.audit_log;
create policy "members read audit" on public.audit_log
  for select to authenticated using (public.is_member());

-- =============================================================================
-- Seed the singleton settings row.
-- =============================================================================
insert into public.settings (id) values (1) on conflict (id) do nothing;
