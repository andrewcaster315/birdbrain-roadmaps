-- =============================================================================
-- Migration 004 — Add local priority on placements and subscription lane prefs.
--
-- Each roadmap now has its own ordering for shared / subscription-arrived
-- items, independent of the source team's priority. Source priority stays on
-- items.priority. Local priority lives on the placement (for direct shares
-- including the home placement) or on subscribed_item_lane_prefs (for items
-- arriving via subscription).
-- =============================================================================

-- Add the column to placements. Backfill from existing position so ordering
-- doesn't shuffle on existing data.
alter table public.placements
  add column if not exists local_priority integer;

update public.placements
   set local_priority = coalesce(local_priority, position + 1);

alter table public.placements
  alter column local_priority set not null,
  alter column local_priority set default 1;

-- Subscription lane prefs: nullable means "no explicit override; use default."
alter table public.subscribed_item_lane_prefs
  add column if not exists local_priority integer;
