// Supabase-backed implementation of DataService.
//
// Architecture: maintains an in-memory DataSnapshot cache mirroring Postgres.
// Sync getters read from cache; mutations optimistically apply to the cache,
// then persist to Supabase in the background. If the network call fails, the
// cache rolls back and an error is shown.
//
// This keeps the existing synchronous UI working with zero changes. Trade-off:
// users won't see other users' edits until they refresh (no Realtime in v1).

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DataService,
} from "./service";
import type {
  AuditEntry,
  DataSnapshot,
  Favorite,
  Granularity,
  Group,
  ID,
  Item,
  Marker,
  Placement,
  QuarterMode,
  RenderedItem,
  Roadmap,
  Settings,
  StatusDef,
  Subscription,
  SubscribedItemLanePref,
  Swimlane,
  User,
} from "../types";
import { newId, nowISO } from "../utils/id";
import { buildEmpty } from "./seed";

// ---------- row <-> domain mappers (snake_case ↔ camelCase) ----------
const rowToUser = (r: any): User => ({
  id: r.id,
  email: r.email,
  displayName: r.display_name,
  termsVersionAccepted: r.terms_version_accepted ?? null,
  termsAcceptedAt: r.terms_accepted_at ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

const rowToGroup = (r: any): Group => ({
  id: r.id,
  name: r.name,
  description: r.description ?? "",
  parentGroupId: r.parent_group_id,
  createdById: r.created_by_id,
  updatedById: r.updated_by_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});
const groupToRow = (g: Group) => ({
  id: g.id,
  name: g.name,
  description: g.description,
  parent_group_id: g.parentGroupId,
  created_by_id: g.createdById,
  updated_by_id: g.updatedById,
  deleted_at: g.deletedAt,
});

const rowToRoadmap = (r: any): Roadmap => ({
  id: r.id,
  groupId: r.group_id,
  name: r.name,
  description: r.description ?? "",
  timelineGranularity: r.timeline_granularity,
  quarterMode: r.quarter_mode,
  createdById: r.created_by_id,
  updatedById: r.updated_by_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});
const roadmapToRow = (r: Roadmap) => ({
  id: r.id,
  group_id: r.groupId,
  name: r.name,
  description: r.description,
  timeline_granularity: r.timelineGranularity,
  quarter_mode: r.quarterMode,
  created_by_id: r.createdById,
  updated_by_id: r.updatedById,
  deleted_at: r.deletedAt,
});

const rowToSwimlane = (r: any): Swimlane => ({
  id: r.id,
  roadmapId: r.roadmap_id,
  name: r.name,
  description: r.description ?? "",
  position: r.position,
  createdById: r.created_by_id,
  updatedById: r.updated_by_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const swimlaneToRow = (s: Swimlane) => ({
  id: s.id,
  roadmap_id: s.roadmapId,
  name: s.name,
  description: s.description,
  position: s.position,
  created_by_id: s.createdById,
  updated_by_id: s.updatedById,
});

const rowToItem = (r: any): Item => ({
  id: r.id,
  homeRoadmapId: r.home_roadmap_id,
  title: r.title,
  status: r.status,
  ownerId: r.owner_id,
  ownerText: r.owner_text ?? "",
  notes: r.notes ?? "",
  startDate: r.start_date,
  endDate: r.end_date,
  dependsOnItemIds: r.depends_on_item_ids ?? [],
  priority: r.priority ?? 1,
  createdById: r.created_by_id,
  updatedById: r.updated_by_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});
const itemToRow = (i: Item) => ({
  id: i.id,
  home_roadmap_id: i.homeRoadmapId,
  title: i.title,
  status: i.status,
  owner_id: i.ownerId,
  owner_text: i.ownerText,
  notes: i.notes,
  start_date: i.startDate,
  end_date: i.endDate,
  depends_on_item_ids: i.dependsOnItemIds,
  priority: i.priority,
  created_by_id: i.createdById,
  updated_by_id: i.updatedById,
  deleted_at: i.deletedAt,
});

const rowToPlacement = (r: any): Placement => ({
  roadmapId: r.roadmap_id,
  itemId: r.item_id,
  swimlaneId: r.swimlane_id,
  localPriority:
    typeof r.local_priority === "number" ? r.local_priority : r.position ?? 1,
  position: r.position,
  createdAt: r.created_at,
});
const placementToRow = (p: Placement) => ({
  roadmap_id: p.roadmapId,
  item_id: p.itemId,
  swimlane_id: p.swimlaneId,
  local_priority: p.localPriority,
  position: p.position,
});

const rowToLanePref = (r: any): SubscribedItemLanePref => ({
  subscriberRoadmapId: r.subscriber_roadmap_id,
  itemId: r.item_id,
  swimlaneId: r.swimlane_id,
  localPriority:
    typeof r.local_priority === "number" ? r.local_priority : null,
  createdAt: r.created_at,
});

const rowToSubscription = (r: any): Subscription => ({
  subscriberRoadmapId: r.subscriber_roadmap_id,
  subscribedRoadmapId: r.subscribed_roadmap_id,
  createdAt: r.created_at,
});

const rowToFavorite = (r: any): Favorite => ({
  userId: r.user_id,
  roadmapId: r.roadmap_id,
  position: r.position,
  createdAt: r.created_at,
});

const rowToMarker = (r: any): Marker => ({
  id: r.id,
  roadmapId: r.roadmap_id,
  date: r.date,
  label: r.label ?? "",
  color: r.color,
  createdById: r.created_by_id,
  updatedById: r.updated_by_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const markerToRow = (m: Marker) => ({
  id: m.id,
  roadmap_id: m.roadmapId,
  date: m.date,
  label: m.label,
  color: m.color,
  created_by_id: m.createdById,
  updated_by_id: m.updatedById,
});

const rowToAudit = (r: any): AuditEntry => ({
  id: r.id,
  entity: r.entity,
  entityId: r.entity_id,
  action: r.action,
  changes: r.changes,
  summary: r.summary ?? "",
  actorId: r.actor_id,
  createdAt: r.created_at,
});

// ---------- Service implementation ----------

export class SupabaseService implements DataService {
  private snap: DataSnapshot = buildEmpty();
  private listeners = new Set<() => void>();
  private loaded = false;
  public ready: Promise<void>;

  // Called when a background mutation fails. The default just logs; the
  // DataContext overrides this to surface a toast in the UI.
  public onError: (message: string) => void = (msg) => {
    console.error("[SupabaseService]", msg);
  };

  constructor(private supabase: SupabaseClient) {
    this.ready = this.loadAll();
  }

  isReady() {
    return this.loaded;
  }

  subscribeListener(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify() {
    this.listeners.forEach((l) => l());
  }

  // ---------- Initial load ----------
  private async loadAll() {
    const sb = this.supabase;
    const [
      settingsR, usersR, groupsR, roadmapsR, swimlanesR,
      itemsR, placementsR, lanePrefsR, subsR, favoritesR, markersR,
    ] = await Promise.all([
      sb.from("settings").select().maybeSingle(),
      sb.from("users").select(),
      sb.from("groups").select(),
      sb.from("roadmaps").select(),
      sb.from("swimlanes").select(),
      sb.from("items").select(),
      sb.from("placements").select(),
      sb.from("subscribed_item_lane_prefs").select(),
      sb.from("roadmap_subscriptions").select(),
      sb.from("favorites").select(),
      sb.from("markers").select(),
    ]);

    // Check every table — previously only the first 4 were inspected, which
    // meant a failure on items/placements/etc. silently produced an empty
    // dataset and left `loaded` flipped to true.
    const tableResults: Array<[string, { error: unknown }]> = [
      ["settings", settingsR],
      ["users", usersR],
      ["groups", groupsR],
      ["roadmaps", roadmapsR],
      ["swimlanes", swimlanesR],
      ["items", itemsR],
      ["placements", placementsR],
      ["subscribed_item_lane_prefs", lanePrefsR],
      ["roadmap_subscriptions", subsR],
      ["favorites", favoritesR],
      ["markers", markersR],
    ];
    const failed = tableResults.find(([, r]) => r.error);
    if (failed) {
      const [name, r] = failed;
      const msg = (r.error as { message?: string })?.message ?? "unknown error";
      this.onError(`Failed to load ${name}: ${msg}`);
      // Still mark loaded so the UI doesn't hang on the loading screen
      // forever; the toast tells the user something is wrong.
      this.loaded = true;
      this.notify();
      return;
    }

    const settings: Settings = {
      fiscalYearStartMonth: settingsR.data?.fiscal_year_start_month ?? 1,
      allowedEmailDomains: settingsR.data?.allowed_email_domains ?? [],
      statuses: (settingsR.data?.statuses ?? []) as StatusDef[],
      orgName: settingsR.data?.org_name ?? "Roadmaps",
    };

    this.snap = {
      settings,
      users: (usersR.data ?? []).map(rowToUser),
      groups: (groupsR.data ?? []).map(rowToGroup),
      roadmaps: (roadmapsR.data ?? []).map(rowToRoadmap),
      swimlanes: (swimlanesR.data ?? []).map(rowToSwimlane),
      items: (itemsR.data ?? []).map(rowToItem),
      placements: (placementsR.data ?? []).map(rowToPlacement),
      subscribedItemLanePrefs: (lanePrefsR.data ?? []).map(rowToLanePref),
      subscriptions: (subsR.data ?? []).map(rowToSubscription),
      favorites: (favoritesR.data ?? []).map(rowToFavorite),
      markers: (markersR.data ?? []).map(rowToMarker),
      audit: [], // fetched lazily by listRecentAudit
    };
    this.loaded = true;
    this.notify();
  }

  // ---------- Helpers ----------
  private mutate<T>(
    apply: () => T,
    rollback: () => void,
    network: () => PromiseLike<{ error: { message: string } | null }>
  ): T {
    const result = apply();
    this.notify();
    Promise.resolve(network())
      .then(({ error }) => {
        if (error) {
          rollback();
          this.notify();
          this.onError(error.message);
        }
      })
      .catch((err) => {
        rollback();
        this.notify();
        this.onError(err?.message ?? String(err));
      });
    return result;
  }

  private live<T extends { deletedAt: string | null }>(rows: T[]) {
    return rows.filter((r) => r.deletedAt === null);
  }
  private byId<T extends { id: ID }>(rows: T[], id: ID) {
    return rows.find((r) => r.id === id) ?? null;
  }
  private replace<T extends { id: ID }>(rows: T[], next: T) {
    return rows.map((r) => (r.id === next.id ? next : r));
  }

  // ---------- Settings ----------
  getSettings() {
    return this.snap.settings;
  }
  updateSettings(patch: Partial<Settings>, _actorId: ID | null): Settings {
    const before = this.snap.settings;
    const next: Settings = { ...before, ...patch };
    if (
      typeof next.fiscalYearStartMonth !== "number" ||
      next.fiscalYearStartMonth < 1 ||
      next.fiscalYearStartMonth > 12
    ) {
      throw new Error("Fiscal year start month must be between 1 and 12.");
    }
    return this.mutate(
      () => {
        this.snap = { ...this.snap, settings: next };
        return next;
      },
      () => {
        this.snap = { ...this.snap, settings: before };
      },
      () =>
        this.supabase
          .from("settings")
          .update({
            fiscal_year_start_month: next.fiscalYearStartMonth,
            allowed_email_domains: next.allowedEmailDomains,
            org_name: next.orgName,
          })
          .eq("id", 1)
          .then(({ error }) => ({ error }))
    );
  }

  // ---------- Statuses (stored in settings.statuses) ----------
  listStatuses() {
    return this.snap.settings.statuses
      .slice()
      .sort((a, b) => a.position - b.position);
  }
  private writeStatuses(next: StatusDef[]): PromiseLike<{ error: any }> {
    return this.supabase
      .from("settings")
      .update({ statuses: next })
      .eq("id", 1)
      .then(({ error }) => ({ error }));
  }
  createStatus(fields: { name: string; color: string }, _actorId: ID | null) {
    const trimmed = fields.name.trim();
    if (!trimmed) throw new Error("Status name is required.");
    if (
      this.snap.settings.statuses.some(
        (s) => s.name.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      throw new Error(`A status named "${trimmed}" already exists.`);
    }
    const s: StatusDef = {
      id: newId(),
      name: trimmed,
      color: fields.color,
      position: this.snap.settings.statuses.length,
    };
    const before = this.snap.settings.statuses;
    const next = [...before, s];
    return this.mutate(
      () => {
        this.snap = {
          ...this.snap,
          settings: { ...this.snap.settings, statuses: next },
        };
        return s;
      },
      () => {
        this.snap = {
          ...this.snap,
          settings: { ...this.snap.settings, statuses: before },
        };
      },
      () => this.writeStatuses(next)
    );
  }
  updateStatus(id: ID, patch: Partial<StatusDef>, _actorId: ID | null) {
    const cur = this.snap.settings.statuses.find((s) => s.id === id);
    if (!cur) throw new Error("Status not found.");
    const newName = patch.name?.trim() ?? cur.name;
    if (
      patch.name !== undefined &&
      this.snap.settings.statuses.some(
        (s) => s.id !== id && s.name.toLowerCase() === newName.toLowerCase()
      )
    ) {
      throw new Error(`A status named "${newName}" already exists.`);
    }
    const updated: StatusDef = { ...cur, ...patch, name: newName };
    const beforeStatuses = this.snap.settings.statuses;
    const beforeItems = this.snap.items;
    const nextStatuses = beforeStatuses.map((s) => (s.id === id ? updated : s));
    // If the name changed, retag every item using the old name.
    const nextItems =
      patch.name !== undefined && newName !== cur.name
        ? beforeItems.map((i) =>
            i.status === cur.name ? { ...i, status: newName } : i
          )
        : beforeItems;

    return this.mutate(
      () => {
        this.snap = {
          ...this.snap,
          settings: { ...this.snap.settings, statuses: nextStatuses },
          items: nextItems,
        };
        return updated;
      },
      () => {
        this.snap = {
          ...this.snap,
          settings: { ...this.snap.settings, statuses: beforeStatuses },
          items: beforeItems,
        };
      },
      async () => {
        const { error } = await this.writeStatuses(nextStatuses);
        if (error) return { error };
        if (patch.name !== undefined && newName !== cur.name) {
          const { error: e2 } = await this.supabase
            .from("items")
            .update({ status: newName })
            .eq("status", cur.name);
          return { error: e2 };
        }
        return { error: null };
      }
    );
  }
  deleteStatus(id: ID, _actorId: ID | null) {
    const target = this.snap.settings.statuses.find((s) => s.id === id);
    if (!target) return;
    if (this.snap.settings.statuses.length <= 1) {
      throw new Error("At least one status must exist.");
    }
    const fallback = this.snap.settings.statuses.find((s) => s.id !== id)!;
    const beforeStatuses = this.snap.settings.statuses;
    const beforeItems = this.snap.items;
    const nextStatuses = beforeStatuses.filter((s) => s.id !== id);
    const nextItems = beforeItems.map((i) =>
      i.status === target.name ? { ...i, status: fallback.name } : i
    );
    this.mutate(
      () => {
        this.snap = {
          ...this.snap,
          settings: { ...this.snap.settings, statuses: nextStatuses },
          items: nextItems,
        };
      },
      () => {
        this.snap = {
          ...this.snap,
          settings: { ...this.snap.settings, statuses: beforeStatuses },
          items: beforeItems,
        };
      },
      async () => {
        const { error } = await this.writeStatuses(nextStatuses);
        if (error) return { error };
        const { error: e2 } = await this.supabase
          .from("items")
          .update({ status: fallback.name })
          .eq("status", target.name);
        return { error: e2 };
      }
    );
  }

  // ---------- Users ----------
  listUsers() {
    return this.live(this.snap.users);
  }
  getUser(id: ID) {
    return this.byId(this.snap.users, id);
  }
  findUserByEmail(email: string) {
    const e = email.trim().toLowerCase();
    return (
      this.snap.users.find(
        (u) => u.email.toLowerCase() === e && u.deletedAt === null
      ) ?? null
    );
  }
  // createOrFindUser is unused in the Supabase flow: the auth trigger handles
  // it. Implemented for interface completeness.
  createOrFindUser(email: string, displayName?: string): User {
    const existing = this.findUserByEmail(email);
    if (existing) return existing;
    throw new Error(
      "User creation happens via Supabase Auth — call supabase.auth.signInWithOtp instead."
    );
  }
  updateUser(id: ID, patch: { displayName?: string }, _actorId: ID | null) {
    const cur = this.byId(this.snap.users, id);
    if (!cur) throw new Error("User not found.");
    const next: User = {
      ...cur,
      displayName: patch.displayName?.trim() ?? cur.displayName,
    };
    return this.mutate(
      () => {
        this.snap = { ...this.snap, users: this.replace(this.snap.users, next) };
        return next;
      },
      () => {
        this.snap = { ...this.snap, users: this.replace(this.snap.users, cur) };
      },
      () =>
        this.supabase
          .from("users")
          .update({ display_name: next.displayName })
          .eq("id", id)
          .then(({ error }) => ({ error }))
    );
  }
  recordTermsAcceptance(userId: ID, version: string): User {
    const cur = this.byId(this.snap.users, userId);
    if (!cur) throw new Error("User not found.");
    if (cur.termsVersionAccepted === version) return cur;
    const acceptedAt = nowISO();
    const next: User = {
      ...cur,
      termsVersionAccepted: version,
      termsAcceptedAt: acceptedAt,
    };
    return this.mutate(
      () => {
        this.snap = { ...this.snap, users: this.replace(this.snap.users, next) };
        return next;
      },
      () => {
        this.snap = { ...this.snap, users: this.replace(this.snap.users, cur) };
      },
      () =>
        this.supabase
          .from("users")
          .update({
            terms_version_accepted: version,
            terms_accepted_at: acceptedAt,
          })
          .eq("id", userId)
          .then(({ error }) => ({ error }))
    );
  }

  // ---------- Groups ----------
  listGroups(includeDeleted = false) {
    return includeDeleted
      ? this.snap.groups.slice()
      : this.live(this.snap.groups);
  }
  getGroup(id: ID) {
    return this.byId(this.snap.groups, id);
  }
  createGroup(
    fields: { name: string; description?: string; parentGroupId?: ID | null },
    actorId: ID | null
  ): Group {
    const trimmed = fields.name.trim();
    if (!trimmed) throw new Error("Name is required.");
    if (
      this.live(this.snap.groups).some(
        (g) => g.name.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      throw new Error(`A group named "${trimmed}" already exists.`);
    }
    const g: Group = {
      id: newId(),
      name: trimmed,
      description: fields.description?.trim() ?? "",
      parentGroupId: fields.parentGroupId ?? null,
      createdById: actorId,
      updatedById: actorId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      deletedAt: null,
    };
    return this.mutate(
      () => {
        this.snap = { ...this.snap, groups: [...this.snap.groups, g] };
        return g;
      },
      () => {
        this.snap = {
          ...this.snap,
          groups: this.snap.groups.filter((x) => x.id !== g.id),
        };
      },
      () =>
        this.supabase
          .from("groups")
          .insert(groupToRow(g))
          .then(({ error }) => ({ error }))
    );
  }
  updateGroup(
    id: ID,
    patch: { name?: string; description?: string; parentGroupId?: ID | null },
    actorId: ID | null
  ): Group {
    const cur = this.byId(this.snap.groups, id);
    if (!cur) throw new Error("Group not found.");
    const next: Group = {
      ...cur,
      ...patch,
      name: patch.name?.trim() ?? cur.name,
      description: patch.description?.trim() ?? cur.description,
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    return this.mutate(
      () => {
        this.snap = { ...this.snap, groups: this.replace(this.snap.groups, next) };
        return next;
      },
      () => {
        this.snap = { ...this.snap, groups: this.replace(this.snap.groups, cur) };
      },
      () =>
        this.supabase
          .from("groups")
          .update({
            name: next.name,
            description: next.description,
            parent_group_id: next.parentGroupId,
            updated_by_id: actorId,
          })
          .eq("id", id)
          .then(({ error }) => ({ error }))
    );
  }
  deleteGroup(id: ID, actorId: ID | null) {
    const cur = this.byId(this.snap.groups, id);
    if (!cur) return;
    const next: Group = {
      ...cur,
      deletedAt: nowISO(),
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    this.mutate(
      () => {
        this.snap = { ...this.snap, groups: this.replace(this.snap.groups, next) };
      },
      () => {
        this.snap = { ...this.snap, groups: this.replace(this.snap.groups, cur) };
      },
      () =>
        this.supabase
          .from("groups")
          .update({ deleted_at: next.deletedAt, updated_by_id: actorId })
          .eq("id", id)
          .then(({ error }) => ({ error }))
    );
  }

  // ---------- Roadmaps ----------
  listRoadmaps(groupId?: ID) {
    const all = this.live(this.snap.roadmaps);
    return groupId ? all.filter((r) => r.groupId === groupId) : all;
  }
  getRoadmap(id: ID) {
    return this.byId(this.snap.roadmaps, id);
  }
  createRoadmap(
    groupId: ID,
    name: string,
    description: string,
    actorId: ID | null
  ): Roadmap {
    const rm: Roadmap = {
      id: newId(),
      groupId,
      name: name.trim(),
      description: description.trim(),
      timelineGranularity: "months",
      quarterMode: "CY",
      createdById: actorId,
      updatedById: actorId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      deletedAt: null,
    };
    return this.mutate(
      () => {
        this.snap = { ...this.snap, roadmaps: [...this.snap.roadmaps, rm] };
        return rm;
      },
      () => {
        this.snap = {
          ...this.snap,
          roadmaps: this.snap.roadmaps.filter((x) => x.id !== rm.id),
        };
      },
      () =>
        this.supabase
          .from("roadmaps")
          .insert(roadmapToRow(rm))
          .then(({ error }) => ({ error }))
    );
  }
  updateRoadmap(
    id: ID,
    patch: Partial<Pick<Roadmap, "name" | "description" | "timelineGranularity" | "quarterMode">>,
    actorId: ID | null
  ): Roadmap {
    const cur = this.byId(this.snap.roadmaps, id);
    if (!cur) throw new Error("Roadmap not found.");
    const next: Roadmap = {
      ...cur,
      ...patch,
      name: patch.name?.trim() ?? cur.name,
      description: patch.description?.trim() ?? cur.description,
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    return this.mutate(
      () => {
        this.snap = {
          ...this.snap,
          roadmaps: this.replace(this.snap.roadmaps, next),
        };
        return next;
      },
      () => {
        this.snap = {
          ...this.snap,
          roadmaps: this.replace(this.snap.roadmaps, cur),
        };
      },
      () =>
        this.supabase
          .from("roadmaps")
          .update({
            name: next.name,
            description: next.description,
            timeline_granularity: next.timelineGranularity,
            quarter_mode: next.quarterMode,
            updated_by_id: actorId,
          })
          .eq("id", id)
          .then(({ error }) => ({ error }))
    );
  }
  deleteRoadmap(id: ID, actorId: ID | null) {
    const cur = this.byId(this.snap.roadmaps, id);
    if (!cur) return;
    const next: Roadmap = {
      ...cur,
      deletedAt: nowISO(),
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    this.mutate(
      () => {
        this.snap = {
          ...this.snap,
          roadmaps: this.replace(this.snap.roadmaps, next),
          subscriptions: this.snap.subscriptions.filter(
            (s) =>
              s.subscriberRoadmapId !== id && s.subscribedRoadmapId !== id
          ),
          favorites: this.snap.favorites.filter((f) => f.roadmapId !== id),
        };
      },
      () => {
        this.snap = {
          ...this.snap,
          roadmaps: this.replace(this.snap.roadmaps, cur),
        };
      },
      () =>
        this.supabase
          .from("roadmaps")
          .update({ deleted_at: next.deletedAt, updated_by_id: actorId })
          .eq("id", id)
          .then(({ error }) => ({ error }))
    );
  }

  // ---------- Swimlanes ----------
  listSwimlanes(roadmapId: ID) {
    return this.snap.swimlanes
      .filter((s) => s.roadmapId === roadmapId)
      .sort((a, b) => a.position - b.position);
  }
  createSwimlane(
    roadmapId: ID,
    name: string,
    description: string,
    actorId: ID | null
  ): Swimlane {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Swimlane name is required.");
    const sl: Swimlane = {
      id: newId(),
      roadmapId,
      name: trimmed,
      description: description.trim(),
      position: this.snap.swimlanes.filter((s) => s.roadmapId === roadmapId)
        .length,
      createdById: actorId,
      updatedById: actorId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    return this.mutate(
      () => {
        this.snap = { ...this.snap, swimlanes: [...this.snap.swimlanes, sl] };
        return sl;
      },
      () => {
        this.snap = {
          ...this.snap,
          swimlanes: this.snap.swimlanes.filter((x) => x.id !== sl.id),
        };
      },
      () =>
        this.supabase
          .from("swimlanes")
          .insert(swimlaneToRow(sl))
          .then(({ error }) => ({ error }))
    );
  }
  updateSwimlane(
    id: ID,
    patch: Partial<Pick<Swimlane, "name" | "description" | "position">>,
    actorId: ID | null
  ): Swimlane {
    const cur = this.byId(this.snap.swimlanes, id);
    if (!cur) throw new Error("Swimlane not found.");
    const next: Swimlane = {
      ...cur,
      ...patch,
      name: patch.name?.trim() ?? cur.name,
      description: patch.description?.trim() ?? cur.description,
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    return this.mutate(
      () => {
        this.snap = {
          ...this.snap,
          swimlanes: this.replace(this.snap.swimlanes, next),
        };
        return next;
      },
      () => {
        this.snap = {
          ...this.snap,
          swimlanes: this.replace(this.snap.swimlanes, cur),
        };
      },
      () =>
        this.supabase
          .from("swimlanes")
          .update({
            name: next.name,
            description: next.description,
            position: next.position,
            updated_by_id: actorId,
          })
          .eq("id", id)
          .then(({ error }) => ({ error }))
    );
  }
  deleteSwimlane(id: ID, _actorId: ID | null) {
    const cur = this.byId(this.snap.swimlanes, id);
    if (!cur) return;
    const beforeSwimlanes = this.snap.swimlanes;
    const beforePlacements = this.snap.placements;
    const beforePrefs = this.snap.subscribedItemLanePrefs;
    this.mutate(
      () => {
        this.snap = {
          ...this.snap,
          swimlanes: beforeSwimlanes.filter((s) => s.id !== id),
          placements: beforePlacements.map((p) =>
            p.swimlaneId === id ? { ...p, swimlaneId: null } : p
          ),
          subscribedItemLanePrefs: beforePrefs.map((p) =>
            p.swimlaneId === id ? { ...p, swimlaneId: null } : p
          ),
        };
      },
      () => {
        this.snap = {
          ...this.snap,
          swimlanes: beforeSwimlanes,
          placements: beforePlacements,
          subscribedItemLanePrefs: beforePrefs,
        };
      },
      () =>
        this.supabase
          .from("swimlanes")
          .delete()
          .eq("id", id)
          .then(({ error }) => ({ error }))
    );
  }

  // ---------- Items ----------
  getItem(id: ID) {
    return this.byId(this.snap.items, id);
  }
  listItems() {
    return this.live(this.snap.items);
  }
  createItem(
    homeRoadmapId: ID,
    fields: Partial<Item> & { swimlaneId?: ID | null },
    actorId: ID | null
  ): Item {
    const statuses = this.listStatuses();
    const defaultStatus = statuses[0]?.name ?? "Planned";
    const homeItems = this.snap.items.filter(
      (i) => i.homeRoadmapId === homeRoadmapId && i.deletedAt === null
    );
    const maxPriority = homeItems.reduce(
      (m, i) => Math.max(m, i.priority ?? 0),
      0
    );
    const item: Item = {
      id: newId(),
      homeRoadmapId,
      title: (fields.title ?? "Untitled").trim() || "Untitled",
      status: fields.status ?? defaultStatus,
      ownerId: fields.ownerId ?? null,
      ownerText: fields.ownerText?.trim() ?? "",
      notes: fields.notes ?? "",
      startDate: fields.startDate ?? null,
      endDate: fields.endDate ?? null,
      dependsOnItemIds: fields.dependsOnItemIds ?? [],
      priority: fields.priority ?? maxPriority + 1,
      createdById: actorId,
      updatedById: actorId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      deletedAt: null,
    };
    const placement: Placement = {
      roadmapId: homeRoadmapId,
      itemId: item.id,
      swimlaneId: fields.swimlaneId ?? null,
      // Home-roadmap local priority mirrors the source priority by default.
      localPriority: item.priority,
      position: this.snap.placements.filter(
        (p) => p.roadmapId === homeRoadmapId
      ).length,
      createdAt: nowISO(),
    };
    return this.mutate(
      () => {
        this.snap = {
          ...this.snap,
          items: [...this.snap.items, item],
          placements: [...this.snap.placements, placement],
        };
        return item;
      },
      () => {
        this.snap = {
          ...this.snap,
          items: this.snap.items.filter((x) => x.id !== item.id),
          placements: this.snap.placements.filter(
            (p) => !(p.itemId === item.id && p.roadmapId === homeRoadmapId)
          ),
        };
      },
      async () => {
        const { error: e1 } = await this.supabase
          .from("items")
          .insert(itemToRow(item));
        if (e1) return { error: e1 };
        const { error: e2 } = await this.supabase
          .from("placements")
          .insert(placementToRow(placement));
        return { error: e2 };
      }
    );
  }
  updateItem(id: ID, patch: Partial<Item>, actorId: ID | null): Item {
    const cur = this.byId(this.snap.items, id);
    if (!cur) throw new Error("Item not found.");
    const next: Item = {
      ...cur,
      ...patch,
      ownerText: patch.ownerText?.trim() ?? cur.ownerText,
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    return this.mutate(
      () => {
        this.snap = { ...this.snap, items: this.replace(this.snap.items, next) };
        return next;
      },
      () => {
        this.snap = { ...this.snap, items: this.replace(this.snap.items, cur) };
      },
      () => {
        // Build a partial row from only the fields that might have changed.
        const row: Record<string, unknown> = { updated_by_id: actorId };
        if (patch.title !== undefined) row.title = next.title;
        if (patch.status !== undefined) row.status = next.status;
        if (patch.ownerId !== undefined) row.owner_id = next.ownerId;
        if (patch.ownerText !== undefined) row.owner_text = next.ownerText;
        if (patch.notes !== undefined) row.notes = next.notes;
        if (patch.startDate !== undefined) row.start_date = next.startDate;
        if (patch.endDate !== undefined) row.end_date = next.endDate;
        if (patch.dependsOnItemIds !== undefined)
          row.depends_on_item_ids = next.dependsOnItemIds;
        if (patch.priority !== undefined) row.priority = next.priority;
        if (patch.deletedAt !== undefined) row.deleted_at = next.deletedAt;
        return this.supabase
          .from("items")
          .update(row)
          .eq("id", id)
          .then(({ error }) => ({ error }));
      }
    );
  }
  deleteItem(id: ID, actorId: ID | null) {
    const cur = this.byId(this.snap.items, id);
    if (!cur) return;
    const next: Item = {
      ...cur,
      deletedAt: nowISO(),
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    this.mutate(
      () => {
        this.snap = { ...this.snap, items: this.replace(this.snap.items, next) };
      },
      () => {
        this.snap = { ...this.snap, items: this.replace(this.snap.items, cur) };
      },
      () =>
        this.supabase
          .from("items")
          .update({ deleted_at: next.deletedAt, updated_by_id: actorId })
          .eq("id", id)
          .then(({ error }) => ({ error }))
    );
  }
  restoreItem(id: ID, actorId: ID | null) {
    const cur = this.byId(this.snap.items, id);
    if (!cur) return;
    const next: Item = {
      ...cur,
      deletedAt: null,
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    this.mutate(
      () => {
        this.snap = { ...this.snap, items: this.replace(this.snap.items, next) };
      },
      () => {
        this.snap = { ...this.snap, items: this.replace(this.snap.items, cur) };
      },
      () =>
        this.supabase
          .from("items")
          .update({ deleted_at: null, updated_by_id: actorId })
          .eq("id", id)
          .then(({ error }) => ({ error }))
    );
  }

  moveItemPriority(
    itemId: ID,
    direction: "up" | "down",
    actorId: ID | null
  ): void {
    const cur = this.byId(this.snap.items, itemId);
    if (!cur) return;
    const peers = this.snap.items
      .filter(
        (i) => i.homeRoadmapId === cur.homeRoadmapId && i.deletedAt === null
      )
      .slice()
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    const idx = peers.findIndex((i) => i.id === itemId);
    if (idx === -1) return;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= peers.length) return;
    const a = peers[idx];
    const b = peers[swapWith];
    const aNext: Item = {
      ...a,
      priority: b.priority,
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    const bNext: Item = {
      ...b,
      priority: a.priority,
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    this.mutate(
      () => {
        this.snap = {
          ...this.snap,
          items: this.snap.items.map((i) =>
            i.id === a.id ? aNext : i.id === b.id ? bNext : i
          ),
        };
      },
      () => {
        this.snap = {
          ...this.snap,
          items: this.snap.items.map((i) =>
            i.id === a.id ? a : i.id === b.id ? b : i
          ),
        };
      },
      async () => {
        const { error: e1 } = await this.supabase
          .from("items")
          .update({ priority: aNext.priority, updated_by_id: actorId })
          .eq("id", a.id);
        if (e1) return { error: e1 };
        const { error: e2 } = await this.supabase
          .from("items")
          .update({ priority: bNext.priority, updated_by_id: actorId })
          .eq("id", b.id);
        if (e2) {
          // Compensating undo of e1's write so the DB doesn't end up with
          // two items at the same priority. Best-effort.
          await this.supabase
            .from("items")
            .update({ priority: a.priority, updated_by_id: actorId })
            .eq("id", a.id)
            .then(({ error }) => {
              if (error)
                console.error(
                  "[supabaseService] moveItemPriority compensating undo failed:",
                  error
                );
            });
          return { error: e2 };
        }
        return { error: null };
      }
    );
  }

  itemsForRoadmap(roadmapId: ID): RenderedItem[] {
    const direct = this.snap.placements
      .filter((p) => p.roadmapId === roadmapId)
      .map((p) => ({ p, item: this.byId(this.snap.items, p.itemId) }))
      .filter(
        (x): x is { p: Placement; item: Item } =>
          !!x.item && x.item.deletedAt === null
      );
    const result = new Map<ID, RenderedItem>();
    for (const { p, item } of direct) {
      result.set(item.id, {
        item,
        viaSubscription: false,
        sourceRoadmapId: roadmapId,
        swimlaneId: p.swimlaneId,
        localPriority: p.localPriority,
      });
    }
    const subscribedTo = this.snap.subscriptions
      .filter((s) => s.subscriberRoadmapId === roadmapId)
      .map((s) => s.subscribedRoadmapId);

    type SubCandidate = {
      item: Item;
      sourceRoadmapId: ID;
      swimlaneId: ID | null;
      override: number | null;
    };
    const subCandidates: SubCandidate[] = [];
    for (const subId of subscribedTo) {
      const subRoadmap = this.byId(this.snap.roadmaps, subId);
      if (!subRoadmap || subRoadmap.deletedAt !== null) continue;
      const placed = this.snap.placements
        .filter((p) => p.roadmapId === subId)
        .map((p) => this.byId(this.snap.items, p.itemId))
        .filter((it): it is Item => !!it && it.deletedAt === null);
      for (const item of placed) {
        if (result.has(item.id)) continue;
        const pref = this.snap.subscribedItemLanePrefs.find(
          (x) => x.subscriberRoadmapId === roadmapId && x.itemId === item.id
        );
        subCandidates.push({
          item,
          sourceRoadmapId: subId,
          swimlaneId: pref?.swimlaneId ?? null,
          override: pref?.localPriority ?? null,
        });
      }
    }

    const explicitMax = [
      ...Array.from(result.values()).map((r) => r.localPriority),
      ...subCandidates
        .filter((c) => c.override !== null)
        .map((c) => c.override as number),
    ];
    let nextDefault = (explicitMax.length ? Math.max(...explicitMax) : 0) + 1;
    for (const c of subCandidates.filter((c) => c.override !== null)) {
      result.set(c.item.id, {
        item: c.item,
        viaSubscription: true,
        sourceRoadmapId: c.sourceRoadmapId,
        swimlaneId: c.swimlaneId,
        localPriority: c.override as number,
      });
    }
    const remainder = subCandidates
      .filter((c) => c.override === null)
      .sort(
        (a, b) =>
          (a.item.priority ?? 0) - (b.item.priority ?? 0) ||
          a.item.title.localeCompare(b.item.title)
      );
    for (const c of remainder) {
      result.set(c.item.id, {
        item: c.item,
        viaSubscription: true,
        sourceRoadmapId: c.sourceRoadmapId,
        swimlaneId: c.swimlaneId,
        localPriority: nextDefault++,
      });
    }
    return Array.from(result.values());
  }

  moveLocalPriority(
    itemId: ID,
    roadmapId: ID,
    direction: "up" | "down",
    actorId: ID | null
  ): void {
    const peers = this.itemsForRoadmap(roadmapId)
      .slice()
      .sort((a, b) => a.localPriority - b.localPriority);
    const idx = peers.findIndex((r) => r.item.id === itemId);
    if (idx === -1) return;
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= peers.length) return;
    const a = peers[idx];
    const b = peers[swap];
    const aTarget = b.localPriority;
    const bTarget = a.localPriority;

    // Capture before-state for rollback.
    const beforePlacements = this.snap.placements;
    const beforePrefs = this.snap.subscribedItemLanePrefs;

    const applyLocal = (r: RenderedItem, value: number) => {
      if (!r.viaSubscription) {
        this.snap = {
          ...this.snap,
          placements: this.snap.placements.map((p) =>
            p.itemId === r.item.id && p.roadmapId === roadmapId
              ? { ...p, localPriority: value }
              : p
          ),
        };
        return;
      }
      const existing = this.snap.subscribedItemLanePrefs.find(
        (x) => x.subscriberRoadmapId === roadmapId && x.itemId === r.item.id
      );
      if (existing) {
        this.snap = {
          ...this.snap,
          subscribedItemLanePrefs: this.snap.subscribedItemLanePrefs.map((x) =>
            x.subscriberRoadmapId === roadmapId && x.itemId === r.item.id
              ? { ...x, localPriority: value }
              : x
          ),
        };
      } else {
        this.snap = {
          ...this.snap,
          subscribedItemLanePrefs: [
            ...this.snap.subscribedItemLanePrefs,
            {
              subscriberRoadmapId: roadmapId,
              itemId: r.item.id,
              swimlaneId: r.swimlaneId,
              localPriority: value,
              createdAt: nowISO(),
            },
          ],
        };
      }
    };

    this.mutate(
      () => {
        applyLocal(a, aTarget);
        applyLocal(b, bTarget);
      },
      () => {
        this.snap = {
          ...this.snap,
          placements: beforePlacements,
          subscribedItemLanePrefs: beforePrefs,
        };
      },
      async () => {
        // Write each row server-side. For subscription items without an
        // existing pref row, we upsert one with swimlane_id and local_priority.
        const writeOne = async (r: RenderedItem, value: number) => {
          if (!r.viaSubscription) {
            return this.supabase
              .from("placements")
              .update({ local_priority: value })
              .eq("item_id", r.item.id)
              .eq("roadmap_id", roadmapId);
          }
          return this.supabase
            .from("subscribed_item_lane_prefs")
            .upsert({
              subscriber_roadmap_id: roadmapId,
              item_id: r.item.id,
              swimlane_id: r.swimlaneId,
              local_priority: value,
            });
        };
        const r1 = await writeOne(a, aTarget);
        if (r1.error) return { error: r1.error };
        const r2 = await writeOne(b, bTarget);
        if (r2.error) {
          // Compensating write: r1 already persisted; undo it server-side
          // so the database doesn't diverge from the rolled-back cache.
          // Best-effort — if this also fails the user will see r2's error
          // and the diverged state will reconcile on next refresh.
          await writeOne(a, a.localPriority).catch((err) => {
            console.error(
              "[supabaseService] moveLocalPriority compensating undo failed:",
              err
            );
          });
          return { error: r2.error };
        }
        return { error: null };
      }
    );
    void actorId; // audit-log entries for local-priority moves aren't persisted server-side yet.
  }

  // ---------- Sharing / placements ----------
  shareItemTo(itemId: ID, roadmapId: ID) {
    const item = this.byId(this.snap.items, itemId);
    if (!item) throw new Error("Item not found.");
    if (
      this.snap.placements.some(
        (p) => p.itemId === itemId && p.roadmapId === roadmapId
      )
    )
      return;
    const existingLocal = [
      ...this.snap.placements
        .filter((p) => p.roadmapId === roadmapId)
        .map((p) => p.localPriority),
      ...this.snap.subscribedItemLanePrefs
        .filter(
          (x) =>
            x.subscriberRoadmapId === roadmapId && x.localPriority !== null
        )
        .map((x) => x.localPriority as number),
    ];
    const nextLocal =
      (existingLocal.length ? Math.max(...existingLocal) : 0) + 1;
    const placement: Placement = {
      itemId,
      roadmapId,
      swimlaneId: null,
      localPriority: nextLocal,
      position: this.snap.placements.filter((p) => p.roadmapId === roadmapId)
        .length,
      createdAt: nowISO(),
    };
    this.mutate(
      () => {
        this.snap = {
          ...this.snap,
          placements: [...this.snap.placements, placement],
        };
      },
      () => {
        this.snap = {
          ...this.snap,
          placements: this.snap.placements.filter(
            (p) => !(p.itemId === itemId && p.roadmapId === roadmapId)
          ),
        };
      },
      () =>
        this.supabase
          .from("placements")
          .insert(placementToRow(placement))
          .then(({ error }) => ({ error }))
    );
  }
  removePlacement(itemId: ID, roadmapId: ID) {
    const item = this.byId(this.snap.items, itemId);
    if (!item) return;
    if (item.homeRoadmapId === roadmapId) {
      throw new Error(
        "This is the item's home roadmap. Use Delete item to remove it everywhere."
      );
    }
    const removed = this.snap.placements.find(
      (p) => p.itemId === itemId && p.roadmapId === roadmapId
    );
    if (!removed) return;
    this.mutate(
      () => {
        this.snap = {
          ...this.snap,
          placements: this.snap.placements.filter(
            (p) => !(p.itemId === itemId && p.roadmapId === roadmapId)
          ),
        };
      },
      () => {
        this.snap = {
          ...this.snap,
          placements: [...this.snap.placements, removed],
        };
      },
      () =>
        this.supabase
          .from("placements")
          .delete()
          .eq("item_id", itemId)
          .eq("roadmap_id", roadmapId)
          .then(({ error }) => ({ error }))
    );
  }
  isItemSharedTo(itemId: ID, roadmapId: ID) {
    return this.snap.placements.some(
      (p) => p.itemId === itemId && p.roadmapId === roadmapId
    );
  }
  setItemSwimlane(itemId: ID, roadmapId: ID, swimlaneId: ID | null) {
    const direct = this.snap.placements.find(
      (p) => p.itemId === itemId && p.roadmapId === roadmapId
    );
    if (direct) {
      const before = direct.swimlaneId;
      this.mutate(
        () => {
          this.snap = {
            ...this.snap,
            placements: this.snap.placements.map((p) =>
              p.itemId === itemId && p.roadmapId === roadmapId
                ? { ...p, swimlaneId }
                : p
            ),
          };
        },
        () => {
          this.snap = {
            ...this.snap,
            placements: this.snap.placements.map((p) =>
              p.itemId === itemId && p.roadmapId === roadmapId
                ? { ...p, swimlaneId: before }
                : p
            ),
          };
        },
        () =>
          this.supabase
            .from("placements")
            .update({ swimlane_id: swimlaneId })
            .eq("item_id", itemId)
            .eq("roadmap_id", roadmapId)
            .then(({ error }) => ({ error }))
      );
      return;
    }
    // Subscription appearance — upsert the lane preference (or delete on null).
    const beforePref = this.snap.subscribedItemLanePrefs.find(
      (x) => x.subscriberRoadmapId === roadmapId && x.itemId === itemId
    );
    const newPrefs = this.snap.subscribedItemLanePrefs.filter(
      (x) => !(x.subscriberRoadmapId === roadmapId && x.itemId === itemId)
    );
    if (swimlaneId !== null) {
      newPrefs.push({
        subscriberRoadmapId: roadmapId,
        itemId,
        swimlaneId,
        // Preserve any existing local-priority override; otherwise null
        // so itemsForRoadmap computes a default.
        localPriority: beforePref?.localPriority ?? null,
        createdAt: beforePref?.createdAt ?? nowISO(),
      });
    }
    this.mutate(
      () => {
        this.snap = { ...this.snap, subscribedItemLanePrefs: newPrefs };
      },
      () => {
        this.snap = {
          ...this.snap,
          subscribedItemLanePrefs: beforePref
            ? [
                ...newPrefs.filter(
                  (x) =>
                    !(
                      x.subscriberRoadmapId === roadmapId &&
                      x.itemId === itemId
                    )
                ),
                beforePref,
              ]
            : newPrefs.filter(
                (x) =>
                  !(
                    x.subscriberRoadmapId === roadmapId &&
                    x.itemId === itemId
                  )
              ),
        };
      },
      async () => {
        if (swimlaneId === null) {
          const { error } = await this.supabase
            .from("subscribed_item_lane_prefs")
            .delete()
            .eq("subscriber_roadmap_id", roadmapId)
            .eq("item_id", itemId);
          return { error };
        }
        const { error } = await this.supabase
          .from("subscribed_item_lane_prefs")
          .upsert({
            subscriber_roadmap_id: roadmapId,
            item_id: itemId,
            swimlane_id: swimlaneId,
          });
        return { error };
      }
    );
  }
  getItemSwimlane(itemId: ID, roadmapId: ID) {
    const direct = this.snap.placements.find(
      (p) => p.itemId === itemId && p.roadmapId === roadmapId
    );
    if (direct) return direct.swimlaneId;
    const pref = this.snap.subscribedItemLanePrefs.find(
      (x) => x.subscriberRoadmapId === roadmapId && x.itemId === itemId
    );
    return pref?.swimlaneId ?? null;
  }

  // ---------- Subscriptions ----------
  subscriptionsFor(roadmapId: ID) {
    return this.snap.subscriptions
      .filter((s) => s.subscriberRoadmapId === roadmapId)
      .map((s) => s.subscribedRoadmapId);
  }
  subscribersOf(roadmapId: ID) {
    return this.snap.subscriptions
      .filter((s) => s.subscribedRoadmapId === roadmapId)
      .map((s) => s.subscriberRoadmapId);
  }
  subscribe(subscriberId: ID, subscribedToId: ID) {
    if (subscriberId === subscribedToId)
      throw new Error("A roadmap can't subscribe to itself.");
    if (
      this.snap.subscriptions.some(
        (s) =>
          s.subscriberRoadmapId === subscriberId &&
          s.subscribedRoadmapId === subscribedToId
      )
    )
      return;
    const sub: Subscription = {
      subscriberRoadmapId: subscriberId,
      subscribedRoadmapId: subscribedToId,
      createdAt: nowISO(),
    };
    this.mutate(
      () => {
        this.snap = {
          ...this.snap,
          subscriptions: [...this.snap.subscriptions, sub],
        };
      },
      () => {
        this.snap = {
          ...this.snap,
          subscriptions: this.snap.subscriptions.filter(
            (s) =>
              !(
                s.subscriberRoadmapId === subscriberId &&
                s.subscribedRoadmapId === subscribedToId
              )
          ),
        };
      },
      () =>
        this.supabase
          .from("roadmap_subscriptions")
          .insert({
            subscriber_roadmap_id: subscriberId,
            subscribed_roadmap_id: subscribedToId,
          })
          .then(({ error }) => ({ error }))
    );
  }
  unsubscribe(subscriberId: ID, subscribedToId: ID) {
    const removed = this.snap.subscriptions.find(
      (s) =>
        s.subscriberRoadmapId === subscriberId &&
        s.subscribedRoadmapId === subscribedToId
    );
    if (!removed) return;
    this.mutate(
      () => {
        this.snap = {
          ...this.snap,
          subscriptions: this.snap.subscriptions.filter(
            (s) =>
              !(
                s.subscriberRoadmapId === subscriberId &&
                s.subscribedRoadmapId === subscribedToId
              )
          ),
          subscribedItemLanePrefs: this.snap.subscribedItemLanePrefs.filter(
            (p) => p.subscriberRoadmapId !== subscriberId
          ),
        };
      },
      () => {
        this.snap = {
          ...this.snap,
          subscriptions: [...this.snap.subscriptions, removed],
        };
      },
      () =>
        this.supabase
          .from("roadmap_subscriptions")
          .delete()
          .eq("subscriber_roadmap_id", subscriberId)
          .eq("subscribed_roadmap_id", subscribedToId)
          .then(({ error }) => ({ error }))
    );
  }

  // ---------- Favorites ----------
  listFavorites(userId: ID) {
    return this.snap.favorites
      .filter((f) => f.userId === userId)
      .sort((a, b) => a.position - b.position)
      .map((f) => f.roadmapId);
  }
  isFavorite(userId: ID, roadmapId: ID) {
    return this.snap.favorites.some(
      (f) => f.userId === userId && f.roadmapId === roadmapId
    );
  }
  addFavorite(userId: ID, roadmapId: ID) {
    if (this.isFavorite(userId, roadmapId)) return;
    const userFavs = this.snap.favorites.filter((f) => f.userId === userId);
    const fav: Favorite = {
      userId,
      roadmapId,
      position: userFavs.length,
      createdAt: nowISO(),
    };
    this.mutate(
      () => {
        this.snap = {
          ...this.snap,
          favorites: [...this.snap.favorites, fav],
        };
      },
      () => {
        this.snap = {
          ...this.snap,
          favorites: this.snap.favorites.filter(
            (f) => !(f.userId === userId && f.roadmapId === roadmapId)
          ),
        };
      },
      () =>
        this.supabase
          .from("favorites")
          .insert({ user_id: userId, roadmap_id: roadmapId, position: fav.position })
          .then(({ error }) => ({ error }))
    );
  }
  removeFavorite(userId: ID, roadmapId: ID) {
    const removed = this.snap.favorites.find(
      (f) => f.userId === userId && f.roadmapId === roadmapId
    );
    if (!removed) return;
    this.mutate(
      () => {
        const remaining = this.snap.favorites
          .filter((f) => f.userId === userId && f.roadmapId !== roadmapId)
          .sort((a, b) => a.position - b.position)
          .map((f, idx) => ({ ...f, position: idx }));
        const others = this.snap.favorites.filter((f) => f.userId !== userId);
        this.snap = { ...this.snap, favorites: [...others, ...remaining] };
      },
      () => {
        this.snap = {
          ...this.snap,
          favorites: [...this.snap.favorites, removed],
        };
      },
      () =>
        this.supabase
          .from("favorites")
          .delete()
          .eq("user_id", userId)
          .eq("roadmap_id", roadmapId)
          .then(({ error }) => ({ error }))
    );
  }
  moveFavorite(userId: ID, roadmapId: ID, direction: "up" | "down") {
    const userFavs = this.snap.favorites
      .filter((f) => f.userId === userId)
      .sort((a, b) => a.position - b.position);
    const idx = userFavs.findIndex((f) => f.roadmapId === roadmapId);
    if (idx === -1) return;
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= userFavs.length) return;
    const a = userFavs[idx];
    const b = userFavs[swap];
    const aNext: Favorite = { ...a, position: b.position };
    const bNext: Favorite = { ...b, position: a.position };
    this.mutate(
      () => {
        const others = this.snap.favorites.filter(
          (f) =>
            f.userId !== userId ||
            (f.roadmapId !== a.roadmapId && f.roadmapId !== b.roadmapId)
        );
        this.snap = { ...this.snap, favorites: [...others, aNext, bNext] };
      },
      () => {
        const others = this.snap.favorites.filter(
          (f) =>
            f.userId !== userId ||
            (f.roadmapId !== a.roadmapId && f.roadmapId !== b.roadmapId)
        );
        this.snap = { ...this.snap, favorites: [...others, a, b] };
      },
      async () => {
        const { error: e1 } = await this.supabase
          .from("favorites")
          .update({ position: aNext.position })
          .eq("user_id", userId)
          .eq("roadmap_id", a.roadmapId);
        if (e1) return { error: e1 };
        const { error: e2 } = await this.supabase
          .from("favorites")
          .update({ position: bNext.position })
          .eq("user_id", userId)
          .eq("roadmap_id", b.roadmapId);
        return { error: e2 };
      }
    );
  }

  // ---------- Markers ----------
  listMarkers(roadmapId: ID) {
    return this.snap.markers
      .filter((m) => m.roadmapId === roadmapId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  createMarker(
    roadmapId: ID,
    fields: { date: string; label: string; color: string },
    actorId: ID | null
  ): Marker {
    if (!fields.date || !/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) {
      throw new Error("A valid date is required.");
    }
    const m: Marker = {
      id: newId(),
      roadmapId,
      date: fields.date,
      label: fields.label.trim(),
      color: fields.color,
      createdById: actorId,
      updatedById: actorId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    return this.mutate(
      () => {
        this.snap = { ...this.snap, markers: [...this.snap.markers, m] };
        return m;
      },
      () => {
        this.snap = {
          ...this.snap,
          markers: this.snap.markers.filter((x) => x.id !== m.id),
        };
      },
      () =>
        this.supabase
          .from("markers")
          .insert(markerToRow(m))
          .then(({ error }) => ({ error }))
    );
  }
  updateMarker(
    id: ID,
    patch: Partial<Pick<Marker, "date" | "label" | "color">>,
    actorId: ID | null
  ): Marker {
    const cur = this.byId(this.snap.markers, id);
    if (!cur) throw new Error("Marker not found.");
    const next: Marker = {
      ...cur,
      ...patch,
      label: patch.label?.trim() ?? cur.label,
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    return this.mutate(
      () => {
        this.snap = {
          ...this.snap,
          markers: this.replace(this.snap.markers, next),
        };
        return next;
      },
      () => {
        this.snap = {
          ...this.snap,
          markers: this.replace(this.snap.markers, cur),
        };
      },
      () =>
        this.supabase
          .from("markers")
          .update({
            date: next.date,
            label: next.label,
            color: next.color,
            updated_by_id: actorId,
          })
          .eq("id", id)
          .then(({ error }) => ({ error }))
    );
  }
  deleteMarker(id: ID, _actorId: ID | null) {
    const cur = this.byId(this.snap.markers, id);
    if (!cur) return;
    this.mutate(
      () => {
        this.snap = {
          ...this.snap,
          markers: this.snap.markers.filter((m) => m.id !== id),
        };
      },
      () => {
        this.snap = { ...this.snap, markers: [...this.snap.markers, cur] };
      },
      () =>
        this.supabase
          .from("markers")
          .delete()
          .eq("id", id)
          .then(({ error }) => ({ error }))
    );
  }

  // ---------- Audit ----------
  // Audit is written server-side by triggers; we fetch on demand.
  listAuditFor(entity: string, entityId: ID): AuditEntry[] {
    return this.snap.audit
      .filter((a) => a.entity === entity && a.entityId === entityId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  listRecentAudit(limit = 100): AuditEntry[] {
    // Fire-and-forget refresh; return whatever we have cached.
    this.supabase
      .from("audit_log")
      .select()
      .order("created_at", { ascending: false })
      .limit(limit)
      .then(({ data, error }) => {
        if (error || !data) return;
        const audit = data.map(rowToAudit);
        this.snap = { ...this.snap, audit };
        this.notify();
      });
    return this.snap.audit.slice(0, limit);
  }

  // ---------- Trash ----------
  trashedItems() {
    return this.snap.items.filter((i) => i.deletedAt !== null);
  }
  trashedRoadmaps() {
    return this.snap.roadmaps.filter((r) => r.deletedAt !== null);
  }
  trashedGroups() {
    return this.snap.groups.filter((g) => g.deletedAt !== null);
  }

  // ---------- Bulk (no-ops in production) ----------
  resetToSeed() {
    throw new Error(
      "Reset is disabled in production. Use the Supabase dashboard to manage data directly."
    );
  }
  resetToEmpty() {
    throw new Error(
      "Reset is disabled in production. Use the Supabase dashboard to manage data directly."
    );
  }
  exportSnapshot() {
    return JSON.stringify(this.snap, null, 2);
  }
}
