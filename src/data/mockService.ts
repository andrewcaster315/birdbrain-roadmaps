// localStorage-backed mock implementation of DataService (v7, single-tenant).

import type {
  DataSnapshot,
  ID,
  Item,
  Placement,
  Roadmap,
  Subscription,
  Swimlane,
  Group,
  RenderedItem,
  Settings,
  User,
  Favorite,
  Marker,
  StatusDef,
  AuditEntry,
  AuditEntity,
  AuditAction,
} from "../types";
import { DEFAULT_STATUSES } from "../types";
import type { DataService } from "./service";
import { newId, nowISO } from "../utils/id";
import { buildSeed, buildEmpty } from "./seed";

const STORAGE_KEY = "roadmapping-tool/v5";

const looksValid = (raw: any) =>
  raw &&
  raw.settings &&
  Array.isArray(raw.users) &&
  Array.isArray(raw.groups) &&
  Array.isArray(raw.roadmaps);

const ensureShape = (raw: any): DataSnapshot => {
  if (!looksValid(raw)) return buildSeed();
  // Backfill optional collections / fields that might be missing in older blobs.
  return {
    ...raw,
    subscribedItemLanePrefs: (raw.subscribedItemLanePrefs ?? []).map(
      (p: any) => ({
        ...p,
        localPriority:
          typeof p.localPriority === "number" ? p.localPriority : null,
      })
    ),
    audit: raw.audit ?? [],
    items: (raw.items ?? []).map((i: any) => ({
      ...i,
      dependsOnItemIds: i.dependsOnItemIds ?? [],
      priority: typeof i.priority === "number" ? i.priority : 999,
    })),
    placements: (raw.placements ?? []).map((p: any) => ({
      ...p,
      localPriority:
        typeof p.localPriority === "number"
          ? p.localPriority
          : (typeof p.position === "number" ? p.position + 1 : 1),
    })),
    users: (raw.users ?? []).map((u: any) => ({
      ...u,
      termsVersionAccepted: u.termsVersionAccepted ?? null,
      termsAcceptedAt: u.termsAcceptedAt ?? null,
    })),
  };
};

const load = (): DataSnapshot => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return ensureShape(JSON.parse(raw));
  } catch (err) {
    console.warn("[mockService] Failed to read from localStorage:", err);
  }
  const seed = buildSeed();
  // Best-effort write of the initial seed. If storage is disabled / full,
  // we still return the in-memory seed so the app boots — changes just
  // won't persist across reloads in that session.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  } catch (err) {
    console.warn("[mockService] Failed to persist seed to localStorage:", err);
  }
  return seed;
};

const save = (snap: DataSnapshot) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch (err) {
    console.warn("[mockService] localStorage save failed:", err);
  }
};

type Listener = () => void;
const listeners = new Set<Listener>();
export const subscribe = (l: Listener) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const notify = () => listeners.forEach((l) => l());

let snap: DataSnapshot = load();
const persist = () => {
  save(snap);
  notify();
};

const live = <T extends { deletedAt: string | null }>(rows: T[]) =>
  rows.filter((r) => r.deletedAt === null);

const byId = <T extends { id: ID }>(rows: T[], id: ID): T | null =>
  rows.find((r) => r.id === id) ?? null;

const replace = <T extends { id: ID }>(rows: T[], next: T): T[] =>
  rows.map((r) => (r.id === next.id ? next : r));

const wouldCycle = (groupId: ID, candidate: ID | null): boolean => {
  if (!candidate) return false;
  if (candidate === groupId) return true;
  let cur: ID | null = candidate;
  const seen = new Set<ID>();
  while (cur) {
    if (seen.has(cur)) return true;
    seen.add(cur);
    if (cur === groupId) return true;
    const g: Group | null = byId(snap.groups, cur);
    cur = g?.parentGroupId ?? null;
  }
  return false;
};

const displayNameFromEmail = (email: string): string => {
  const local = email.split("@")[0] || email;
  return local
    .split(/[._-]+/)
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : ""))
    .join(" ")
    .trim();
};

// ---------- Audit ----------
const audit = (
  entity: AuditEntity,
  entityId: ID,
  action: AuditAction,
  summary: string,
  actorId: ID | null,
  changes: Record<string, { from: unknown; to: unknown }> | null = null
) => {
  const entry: AuditEntry = {
    id: newId(),
    entity,
    entityId,
    action,
    changes,
    summary,
    actorId,
    createdAt: nowISO(),
  };
  snap = { ...snap, audit: [entry, ...snap.audit].slice(0, 5000) };
};

const diff = <T extends Record<string, any>>(
  before: T,
  after: T,
  fields: (keyof T)[]
): Record<string, { from: unknown; to: unknown }> | null => {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of fields) {
    const a = before[f];
    const b = after[f];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes[f as string] = { from: a, to: b };
    }
  }
  return Object.keys(changes).length ? changes : null;
};

export const mockService: DataService = {
  // ---------- Settings ----------
  getSettings() {
    return snap.settings;
  },
  updateSettings(patch, actorId) {
    const before = snap.settings;
    const next: Settings = { ...before, ...patch };
    if (
      typeof next.fiscalYearStartMonth !== "number" ||
      next.fiscalYearStartMonth < 1 ||
      next.fiscalYearStartMonth > 12
    ) {
      throw new Error("Fiscal year start month must be between 1 and 12.");
    }
    snap = { ...snap, settings: next };
    const changes = diff(before, next, [
      "fiscalYearStartMonth",
      "allowedEmailDomains",
      "orgName",
    ]);
    if (changes) audit("settings", "settings", "updated", "Settings updated", actorId, changes);
    persist();
    return next;
  },

  // ---------- Statuses ----------
  listStatuses() {
    return snap.settings.statuses
      .slice()
      .sort((a, b) => a.position - b.position);
  },
  createStatus(fields, actorId) {
    const trimmed = fields.name.trim();
    if (!trimmed) throw new Error("Status name is required.");
    if (
      snap.settings.statuses.some(
        (s) => s.name.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      throw new Error(`A status named "${trimmed}" already exists.`);
    }
    const s: StatusDef = {
      id: newId(),
      name: trimmed,
      color: fields.color,
      position: snap.settings.statuses.length,
    };
    snap = {
      ...snap,
      settings: {
        ...snap.settings,
        statuses: [...snap.settings.statuses, s],
      },
    };
    audit("status", s.id, "created", `Created status "${s.name}"`, actorId);
    persist();
    return s;
  },
  updateStatus(id, patch, actorId) {
    const cur = snap.settings.statuses.find((s) => s.id === id);
    if (!cur) throw new Error("Status not found.");
    const newName = patch.name?.trim() ?? cur.name;
    if (
      patch.name !== undefined &&
      snap.settings.statuses.some(
        (s) => s.id !== id && s.name.toLowerCase() === newName.toLowerCase()
      )
    ) {
      throw new Error(`A status named "${newName}" already exists.`);
    }
    const next: StatusDef = { ...cur, ...patch, name: newName };
    let items = snap.items;
    if (patch.name !== undefined && newName !== cur.name) {
      items = snap.items.map((i) =>
        i.status === cur.name
          ? { ...i, status: newName, updatedAt: nowISO() }
          : i
      );
    }
    snap = {
      ...snap,
      items,
      settings: {
        ...snap.settings,
        statuses: snap.settings.statuses.map((s) => (s.id === id ? next : s)),
      },
    };
    const changes = diff(cur, next, ["name", "color", "position"]);
    if (changes) audit("status", id, "updated", `Updated status "${next.name}"`, actorId, changes);
    persist();
    return next;
  },
  deleteStatus(id, actorId) {
    const target = snap.settings.statuses.find((s) => s.id === id);
    if (!target) return;
    if (snap.settings.statuses.length <= 1) {
      throw new Error("At least one status must exist.");
    }
    const fallback = snap.settings.statuses.find((s) => s.id !== id)!;
    const items = snap.items.map((i) =>
      i.status === target.name
        ? { ...i, status: fallback.name, updatedAt: nowISO() }
        : i
    );
    snap = {
      ...snap,
      items,
      settings: {
        ...snap.settings,
        statuses: snap.settings.statuses.filter((s) => s.id !== id),
      },
    };
    audit("status", id, "deleted", `Deleted status "${target.name}"`, actorId);
    persist();
  },

  // ---------- Users ----------
  listUsers() {
    return live(snap.users);
  },
  getUser(id) {
    return byId(snap.users, id);
  },
  findUserByEmail(email) {
    const e = email.trim().toLowerCase();
    return (
      snap.users.find(
        (u) => u.email.toLowerCase() === e && u.deletedAt === null
      ) ?? null
    );
  },
  createOrFindUser(email, displayName) {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      throw new Error("That doesn't look like a valid email address.");
    }
    const allowed = snap.settings.allowedEmailDomains;
    if (allowed.length > 0) {
      const domain = e.split("@")[1] ?? "";
      const ok = allowed.some(
        (d) => d.trim().toLowerCase() === domain.trim().toLowerCase()
      );
      if (!ok) {
        throw new Error(
          `Sign-in is restricted to: ${allowed.join(", ")}.`
        );
      }
    }
    const existing = this.findUserByEmail(e);
    if (existing) return existing;
    const u: User = {
      id: newId(),
      email: e,
      displayName: displayName?.trim() || displayNameFromEmail(e),
      termsVersionAccepted: null,
      termsAcceptedAt: null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      deletedAt: null,
    };
    snap = { ...snap, users: [...snap.users, u] };
    audit("user", u.id, "created", `New user ${u.displayName} (${u.email})`, u.id);
    persist();
    return u;
  },
  updateUser(id, patch, actorId) {
    const cur = byId(snap.users, id);
    if (!cur) throw new Error("User not found.");
    const next: User = {
      ...cur,
      displayName: patch.displayName?.trim() ?? cur.displayName,
      updatedAt: nowISO(),
    };
    snap = { ...snap, users: replace(snap.users, next) };
    const changes = diff(cur, next, ["displayName"]);
    if (changes) audit("user", id, "updated", `Updated user ${next.displayName}`, actorId, changes);
    persist();
    return next;
  },
  async recordTermsAcceptance(userId, version) {
    const cur = byId(snap.users, userId);
    if (!cur) throw new Error("User not found.");
    if (cur.termsVersionAccepted === version) return cur;
    const next: User = {
      ...cur,
      termsVersionAccepted: version,
      termsAcceptedAt: nowISO(),
      updatedAt: nowISO(),
    };
    snap = { ...snap, users: replace(snap.users, next) };
    audit(
      "user",
      userId,
      "updated",
      `Accepted terms version ${version}`,
      userId,
      { termsVersionAccepted: { from: cur.termsVersionAccepted, to: version } }
    );
    persist();
    return next;
  },

  // ---------- Groups ----------
  listGroups(includeDeleted = false) {
    return includeDeleted ? snap.groups.slice() : live(snap.groups);
  },
  getGroup(id) {
    return byId(snap.groups, id);
  },
  createGroup(fields, actorId) {
    const trimmed = fields.name.trim();
    if (!trimmed) throw new Error("Name is required.");
    if (
      live(snap.groups).some(
        (g) => g.name.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      throw new Error(`A group named "${trimmed}" already exists.`);
    }
    if (fields.parentGroupId && !byId(snap.groups, fields.parentGroupId)) {
      throw new Error("Parent group not found.");
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
    snap = { ...snap, groups: [...snap.groups, g] };
    audit("group", g.id, "created", `Created group "${g.name}"`, actorId);
    persist();
    return g;
  },
  updateGroup(id, patch, actorId) {
    const cur = byId(snap.groups, id);
    if (!cur) throw new Error("Group not found.");
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (!trimmed) throw new Error("Name is required.");
      if (
        live(snap.groups).some(
          (g) => g.id !== id && g.name.toLowerCase() === trimmed.toLowerCase()
        )
      ) {
        throw new Error(`A group named "${trimmed}" already exists.`);
      }
    }
    if (
      patch.parentGroupId !== undefined &&
      wouldCycle(id, patch.parentGroupId)
    ) {
      throw new Error("That parent would create a cycle.");
    }
    const updated: Group = {
      ...cur,
      ...patch,
      name: patch.name?.trim() ?? cur.name,
      description: patch.description?.trim() ?? cur.description,
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    snap = { ...snap, groups: replace(snap.groups, updated) };
    const changes = diff(cur, updated, ["name", "description", "parentGroupId"]);
    if (changes) audit("group", id, "updated", `Updated group "${updated.name}"`, actorId, changes);
    persist();
    return updated;
  },
  deleteGroup(id, actorId) {
    const cur = byId(snap.groups, id);
    if (!cur) return;
    snap = {
      ...snap,
      groups: replace(snap.groups, {
        ...cur,
        deletedAt: nowISO(),
        updatedById: actorId,
        updatedAt: nowISO(),
      }),
    };
    audit("group", id, "deleted", `Deleted group "${cur.name}"`, actorId);
    persist();
  },

  // ---------- Roadmaps ----------
  listRoadmaps(groupId) {
    const all = live(snap.roadmaps);
    return groupId ? all.filter((r) => r.groupId === groupId) : all;
  },
  getRoadmap(id) {
    return byId(snap.roadmaps, id);
  },
  createRoadmap(groupId, name, description, actorId) {
    if (!byId(snap.groups, groupId)) throw new Error("Group not found.");
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
    snap = { ...snap, roadmaps: [...snap.roadmaps, rm] };
    audit("roadmap", rm.id, "created", `Created roadmap "${rm.name}"`, actorId);
    persist();
    return rm;
  },
  updateRoadmap(id, patch, actorId) {
    const cur = byId(snap.roadmaps, id);
    if (!cur) throw new Error("Roadmap not found.");
    const next: Roadmap = {
      ...cur,
      ...patch,
      name: patch.name?.trim() ?? cur.name,
      description: patch.description?.trim() ?? cur.description,
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    snap = { ...snap, roadmaps: replace(snap.roadmaps, next) };
    const changes = diff(cur, next, [
      "name", "description", "timelineGranularity", "quarterMode",
    ]);
    if (changes) audit("roadmap", id, "updated", `Updated roadmap "${next.name}"`, actorId, changes);
    persist();
    return next;
  },
  deleteRoadmap(id, actorId) {
    const cur = byId(snap.roadmaps, id);
    if (!cur) return;
    const next: Roadmap = {
      ...cur,
      deletedAt: nowISO(),
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    snap = {
      ...snap,
      roadmaps: replace(snap.roadmaps, next),
      subscriptions: snap.subscriptions.filter(
        (s) => s.subscriberRoadmapId !== id && s.subscribedRoadmapId !== id
      ),
      favorites: snap.favorites.filter((f) => f.roadmapId !== id),
    };
    audit("roadmap", id, "deleted", `Deleted roadmap "${cur.name}"`, actorId);
    persist();
  },

  // ---------- Swimlanes ----------
  listSwimlanes(roadmapId) {
    return snap.swimlanes
      .filter((s) => s.roadmapId === roadmapId)
      .sort((a, b) => a.position - b.position);
  },
  createSwimlane(roadmapId, name, description, actorId) {
    if (!byId(snap.roadmaps, roadmapId)) throw new Error("Roadmap not found.");
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Swimlane name is required.");
    const sl: Swimlane = {
      id: newId(),
      roadmapId,
      name: trimmed,
      description: description.trim(),
      position: snap.swimlanes.filter((s) => s.roadmapId === roadmapId).length,
      createdById: actorId,
      updatedById: actorId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    snap = { ...snap, swimlanes: [...snap.swimlanes, sl] };
    audit("swimlane", sl.id, "created", `Added lane "${sl.name}"`, actorId);
    persist();
    return sl;
  },
  updateSwimlane(id, patch, actorId) {
    const cur = byId(snap.swimlanes, id);
    if (!cur) throw new Error("Swimlane not found.");
    const next: Swimlane = {
      ...cur,
      ...patch,
      name: patch.name?.trim() ?? cur.name,
      description: patch.description?.trim() ?? cur.description,
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    snap = { ...snap, swimlanes: replace(snap.swimlanes, next) };
    const changes = diff(cur, next, ["name", "description", "position"]);
    if (changes) audit("swimlane", id, "updated", `Updated lane "${next.name}"`, actorId, changes);
    persist();
    return next;
  },
  deleteSwimlane(id, actorId) {
    const cur = byId(snap.swimlanes, id);
    if (!cur) return;
    const placements = snap.placements.map((p) =>
      p.swimlaneId === id ? { ...p, swimlaneId: null } : p
    );
    const subPrefs = snap.subscribedItemLanePrefs.map((p) =>
      p.swimlaneId === id ? { ...p, swimlaneId: null } : p
    );
    snap = {
      ...snap,
      swimlanes: snap.swimlanes.filter((s) => s.id !== id),
      placements,
      subscribedItemLanePrefs: subPrefs,
    };
    audit("swimlane", id, "deleted", `Deleted lane "${cur.name}"`, actorId);
    persist();
  },

  // ---------- Items ----------
  getItem(id) {
    return byId(snap.items, id);
  },
  listItems() {
    return live(snap.items);
  },
  createItem(homeRoadmapId, fields, actorId) {
    if (!byId(snap.roadmaps, homeRoadmapId))
      throw new Error("Home roadmap not found.");
    const statuses = this.listStatuses();
    const defaultStatus = statuses[0]?.name ?? "Planned";
    // New items go to the end of the priority list on their home roadmap.
    const homeItems = snap.items.filter(
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
      swimlaneId: (fields as any).swimlaneId ?? null,
      // On the home roadmap, local priority mirrors source priority.
      localPriority: item.priority,
      position: snap.placements.filter((p) => p.roadmapId === homeRoadmapId)
        .length,
      createdAt: nowISO(),
    };
    snap = {
      ...snap,
      items: [...snap.items, item],
      placements: [...snap.placements, placement],
    };
    audit("item", item.id, "created", `Created "${item.title}"`, actorId);
    persist();
    return item;
  },
  updateItem(id, patch, actorId) {
    const cur = byId(snap.items, id);
    if (!cur) throw new Error("Item not found.");
    const next: Item = {
      ...cur,
      ...patch,
      ownerText: patch.ownerText?.trim() ?? cur.ownerText,
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    snap = { ...snap, items: replace(snap.items, next) };
    const changes = diff(cur, next, [
      "title", "status", "ownerId", "ownerText", "notes",
      "startDate", "endDate", "dependsOnItemIds",
    ]);
    if (changes) audit("item", id, "updated", `Updated "${next.title}"`, actorId, changes);
    persist();
    return next;
  },
  deleteItem(id, actorId) {
    const cur = byId(snap.items, id);
    if (!cur) return;
    snap = {
      ...snap,
      items: replace(snap.items, {
        ...cur,
        deletedAt: nowISO(),
        updatedById: actorId,
        updatedAt: nowISO(),
      }),
    };
    audit("item", id, "deleted", `Deleted "${cur.title}"`, actorId);
    persist();
  },
  restoreItem(id, actorId) {
    const cur = byId(snap.items, id);
    if (!cur) return;
    snap = {
      ...snap,
      items: replace(snap.items, {
        ...cur,
        deletedAt: null,
        updatedById: actorId,
        updatedAt: nowISO(),
      }),
    };
    audit("item", id, "restored", `Restored "${cur.title}"`, actorId);
    persist();
  },

  moveItemPriority(itemId, direction, actorId) {
    const cur = byId(snap.items, itemId);
    if (!cur) throw new Error("Item not found.");
    // Get all live items on the same home roadmap, sorted by priority.
    const peers = snap.items
      .filter(
        (i) => i.homeRoadmapId === cur.homeRoadmapId && i.deletedAt === null
      )
      .slice()
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    const idx = peers.findIndex((i) => i.id === itemId);
    if (idx === -1) return;
    const swapWithIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapWithIdx < 0 || swapWithIdx >= peers.length) return;
    const a = peers[idx];
    const b = peers[swapWithIdx];
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
    const items = snap.items.map((i) =>
      i.id === a.id ? aNext : i.id === b.id ? bNext : i
    );
    snap = { ...snap, items };
    audit(
      "item",
      a.id,
      "updated",
      `Moved "${a.title}" ${direction === "up" ? "up" : "down"} in priority`,
      actorId,
      { priority: { from: a.priority, to: b.priority } }
    );
    persist();
  },

  itemsForRoadmap(roadmapId) {
    const direct = snap.placements
      .filter((p) => p.roadmapId === roadmapId)
      .map((p) => ({ p, item: byId(snap.items, p.itemId) }))
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

    // For subscription items without an explicit localPriority override we
    // assign one after the highest direct + overridden value, ordered by
    // source-team priority. This way the user gets a sensible default but
    // can drag/reorder to claim explicit ownership.
    const subscribedTo = snap.subscriptions
      .filter((s) => s.subscriberRoadmapId === roadmapId)
      .map((s) => s.subscribedRoadmapId);

    type SubCandidate = { item: Item; sourceRoadmapId: ID; swimlaneId: ID | null; override: number | null };
    const subCandidates: SubCandidate[] = [];
    for (const subId of subscribedTo) {
      const subRoadmap = byId(snap.roadmaps, subId);
      if (!subRoadmap || subRoadmap.deletedAt !== null) continue;
      const placed = snap.placements
        .filter((p) => p.roadmapId === subId)
        .map((p) => byId(snap.items, p.itemId))
        .filter((it): it is Item => !!it && it.deletedAt === null);
      for (const item of placed) {
        if (result.has(item.id)) continue;
        const pref = snap.subscribedItemLanePrefs.find(
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

    // Apply explicit overrides first; sort the remainder by source priority
    // for a stable, predictable default order.
    const remainder = subCandidates
      .filter((c) => c.override === null)
      .sort(
        (a, b) =>
          (a.item.priority ?? 0) - (b.item.priority ?? 0) ||
          a.item.title.localeCompare(b.item.title)
      );
    for (const c of subCandidates.filter((c) => c.override !== null)) {
      result.set(c.item.id, {
        item: c.item,
        viaSubscription: true,
        sourceRoadmapId: c.sourceRoadmapId,
        swimlaneId: c.swimlaneId,
        localPriority: c.override as number,
      });
    }
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
  },

  moveLocalPriority(itemId, roadmapId, direction, actorId) {
    const peers = this.itemsForRoadmap(roadmapId)
      .slice()
      .sort((a, b) => a.localPriority - b.localPriority);
    const idx = peers.findIndex((r) => r.item.id === itemId);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= peers.length) return;
    const a = peers[idx];
    const b = peers[swapIdx];

    // Helper that writes a localPriority for a single (item, roadmap) pair.
    // For direct placements we update the placement row; for subscription
    // items we write/upsert a lane-pref override with localPriority set.
    const writeLocal = (r: RenderedItem, value: number) => {
      if (!r.viaSubscription) {
        snap = {
          ...snap,
          placements: snap.placements.map((p) =>
            p.itemId === r.item.id && p.roadmapId === roadmapId
              ? { ...p, localPriority: value }
              : p
          ),
        };
        return;
      }
      const existing = snap.subscribedItemLanePrefs.find(
        (x) => x.subscriberRoadmapId === roadmapId && x.itemId === r.item.id
      );
      if (existing) {
        snap = {
          ...snap,
          subscribedItemLanePrefs: snap.subscribedItemLanePrefs.map((x) =>
            x.subscriberRoadmapId === roadmapId && x.itemId === r.item.id
              ? { ...x, localPriority: value }
              : x
          ),
        };
      } else {
        snap = {
          ...snap,
          subscribedItemLanePrefs: [
            ...snap.subscribedItemLanePrefs,
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

    writeLocal(a, b.localPriority);
    writeLocal(b, a.localPriority);
    audit(
      "item",
      a.item.id,
      "updated",
      `Moved "${a.item.title}" ${direction === "up" ? "up" : "down"} in this roadmap`,
      actorId,
      { localPriority: { from: a.localPriority, to: b.localPriority } }
    );
    persist();
  },

  // ---------- Sharing / placements ----------
  shareItemTo(itemId, roadmapId) {
    const i = byId(snap.items, itemId);
    if (!i) throw new Error("Item not found.");
    const r = byId(snap.roadmaps, roadmapId);
    if (!r) throw new Error("Roadmap not found.");
    if (
      snap.placements.some(
        (p) => p.itemId === itemId && p.roadmapId === roadmapId
      )
    )
      return;
    // Pick a localPriority below any existing direct placements + lane-pref
    // overrides on this roadmap so the newly-shared item lands at the bottom
    // of the explicitly-ordered group.
    const existingLocal = [
      ...snap.placements
        .filter((p) => p.roadmapId === roadmapId)
        .map((p) => p.localPriority),
      ...snap.subscribedItemLanePrefs
        .filter(
          (x) =>
            x.subscriberRoadmapId === roadmapId && x.localPriority !== null
        )
        .map((x) => x.localPriority as number),
    ];
    const nextLocal = (existingLocal.length ? Math.max(...existingLocal) : 0) + 1;
    snap = {
      ...snap,
      placements: [
        ...snap.placements,
        {
          itemId,
          roadmapId,
          swimlaneId: null,
          localPriority: nextLocal,
          position: snap.placements.filter((p) => p.roadmapId === roadmapId)
            .length,
          createdAt: nowISO(),
        },
      ],
    };
    persist();
  },
  removePlacement(itemId, roadmapId) {
    const item = byId(snap.items, itemId);
    if (!item) return;
    if (item.homeRoadmapId === roadmapId) {
      throw new Error(
        "This is the item's home roadmap. Use Delete item to remove it everywhere."
      );
    }
    snap = {
      ...snap,
      placements: snap.placements.filter(
        (p) => !(p.itemId === itemId && p.roadmapId === roadmapId)
      ),
    };
    persist();
  },
  isItemSharedTo(itemId, roadmapId) {
    return snap.placements.some(
      (p) => p.itemId === itemId && p.roadmapId === roadmapId
    );
  },
  setItemSwimlane(itemId, roadmapId, swimlaneId) {
    // Direct placement?
    const directIdx = snap.placements.findIndex(
      (p) => p.itemId === itemId && p.roadmapId === roadmapId
    );
    if (directIdx >= 0) {
      const placements = snap.placements.map((p, i) =>
        i === directIdx ? { ...p, swimlaneId } : p
      );
      snap = { ...snap, placements };
      persist();
      return;
    }
    // Otherwise it's a subscription appearance; use the lane-pref table.
    const existing = snap.subscribedItemLanePrefs.find(
      (x) => x.subscriberRoadmapId === roadmapId && x.itemId === itemId
    );
    const prefs = snap.subscribedItemLanePrefs.filter(
      (x) => !(x.subscriberRoadmapId === roadmapId && x.itemId === itemId)
    );
    if (swimlaneId !== null) {
      prefs.push({
        subscriberRoadmapId: roadmapId,
        itemId,
        swimlaneId,
        // Preserve any prior local-priority override; otherwise leave null
        // and let itemsForRoadmap compute a stable default.
        localPriority: existing?.localPriority ?? null,
        createdAt: existing?.createdAt ?? nowISO(),
      });
    }
    snap = { ...snap, subscribedItemLanePrefs: prefs };
    persist();
  },
  getItemSwimlane(itemId, roadmapId) {
    const direct = snap.placements.find(
      (p) => p.itemId === itemId && p.roadmapId === roadmapId
    );
    if (direct) return direct.swimlaneId;
    const pref = snap.subscribedItemLanePrefs.find(
      (x) => x.subscriberRoadmapId === roadmapId && x.itemId === itemId
    );
    return pref?.swimlaneId ?? null;
  },

  // ---------- Subscriptions ----------
  subscriptionsFor(roadmapId) {
    return snap.subscriptions
      .filter((s) => s.subscriberRoadmapId === roadmapId)
      .map((s) => s.subscribedRoadmapId);
  },
  subscribersOf(roadmapId) {
    return snap.subscriptions
      .filter((s) => s.subscribedRoadmapId === roadmapId)
      .map((s) => s.subscriberRoadmapId);
  },
  subscribe(subscriberId, subscribedToId) {
    if (subscriberId === subscribedToId)
      throw new Error("A roadmap can't subscribe to itself.");
    if (
      snap.subscriptions.some(
        (s) =>
          s.subscriberRoadmapId === subscriberId &&
          s.subscribedRoadmapId === subscribedToId
      )
    )
      return;
    snap = {
      ...snap,
      subscriptions: [
        ...snap.subscriptions,
        {
          subscriberRoadmapId: subscriberId,
          subscribedRoadmapId: subscribedToId,
          createdAt: nowISO(),
        },
      ],
    };
    persist();
  },
  unsubscribe(subscriberId, subscribedToId) {
    snap = {
      ...snap,
      subscriptions: snap.subscriptions.filter(
        (s) =>
          !(
            s.subscriberRoadmapId === subscriberId &&
            s.subscribedRoadmapId === subscribedToId
          )
      ),
      subscribedItemLanePrefs: snap.subscribedItemLanePrefs.filter(
        (p) => p.subscriberRoadmapId !== subscriberId
      ),
    };
    persist();
  },

  // ---------- Favorites ----------
  listFavorites(userId) {
    return snap.favorites
      .filter((f) => f.userId === userId)
      .sort((a, b) => a.position - b.position)
      .map((f) => f.roadmapId);
  },
  isFavorite(userId, roadmapId) {
    return snap.favorites.some(
      (f) => f.userId === userId && f.roadmapId === roadmapId
    );
  },
  addFavorite(userId, roadmapId) {
    if (this.isFavorite(userId, roadmapId)) return;
    const userFavs = snap.favorites.filter((f) => f.userId === userId);
    snap = {
      ...snap,
      favorites: [
        ...snap.favorites,
        {
          userId,
          roadmapId,
          position: userFavs.length,
          createdAt: nowISO(),
        },
      ],
    };
    persist();
  },
  removeFavorite(userId, roadmapId) {
    const remaining = snap.favorites
      .filter((f) => f.userId === userId && f.roadmapId !== roadmapId)
      .sort((a, b) => a.position - b.position)
      .map((f, idx) => ({ ...f, position: idx }));
    const otherUsers = snap.favorites.filter((f) => f.userId !== userId);
    snap = { ...snap, favorites: [...otherUsers, ...remaining] };
    persist();
  },
  moveFavorite(userId, roadmapId, direction) {
    const userFavs = snap.favorites
      .filter((f) => f.userId === userId)
      .sort((a, b) => a.position - b.position);
    const idx = userFavs.findIndex((f) => f.roadmapId === roadmapId);
    if (idx === -1) return;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= userFavs.length) return;
    const a = userFavs[idx];
    const b = userFavs[swapWith];
    const updatedA = { ...a, position: b.position };
    const updatedB = { ...b, position: a.position };
    const others = snap.favorites.filter(
      (f) =>
        f.userId !== userId ||
        (f.roadmapId !== a.roadmapId && f.roadmapId !== b.roadmapId)
    );
    snap = { ...snap, favorites: [...others, updatedA, updatedB] };
    persist();
  },

  // ---------- Markers ----------
  listMarkers(roadmapId) {
    return snap.markers
      .filter((m) => m.roadmapId === roadmapId)
      .sort((a, b) => a.date.localeCompare(b.date));
  },
  createMarker(roadmapId, fields, actorId) {
    if (!byId(snap.roadmaps, roadmapId)) throw new Error("Roadmap not found.");
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
    snap = { ...snap, markers: [...snap.markers, m] };
    audit("marker", m.id, "created", `Added marker "${m.label || m.date}"`, actorId);
    persist();
    return m;
  },
  updateMarker(id, patch, actorId) {
    const cur = byId(snap.markers, id);
    if (!cur) throw new Error("Marker not found.");
    const next: Marker = {
      ...cur,
      ...patch,
      label: patch.label?.trim() ?? cur.label,
      updatedById: actorId,
      updatedAt: nowISO(),
    };
    snap = { ...snap, markers: replace(snap.markers, next) };
    const changes = diff(cur, next, ["date", "label", "color"]);
    if (changes) audit("marker", id, "updated", `Updated marker "${next.label || next.date}"`, actorId, changes);
    persist();
    return next;
  },
  deleteMarker(id, actorId) {
    const cur = byId(snap.markers, id);
    if (!cur) return;
    snap = { ...snap, markers: snap.markers.filter((m) => m.id !== id) };
    audit("marker", id, "deleted", `Deleted marker "${cur.label || cur.date}"`, actorId);
    persist();
  },

  // ---------- Audit ----------
  listAuditFor(entity, entityId) {
    return snap.audit.filter(
      (e) => e.entity === entity && e.entityId === entityId
    );
  },
  listRecentAudit(limit = 100) {
    return snap.audit.slice(0, limit);
  },

  // ---------- Trash ----------
  trashedItems() {
    return snap.items.filter((i) => i.deletedAt !== null);
  },
  trashedRoadmaps() {
    return snap.roadmaps.filter((r) => r.deletedAt !== null);
  },
  trashedGroups() {
    return snap.groups.filter((g) => g.deletedAt !== null);
  },

  // ---------- Bulk ----------
  resetToSeed() {
    snap = buildSeed();
    persist();
  },
  resetToEmpty() {
    snap = buildEmpty();
    persist();
  },
  exportSnapshot() {
    return JSON.stringify(snap, null, 2);
  },
};
