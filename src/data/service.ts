// Service-layer interface (single-tenant).

import type {
  ID,
  Group,
  Roadmap,
  Item,
  Swimlane,
  RenderedItem,
  Granularity,
  QuarterMode,
  Settings,
  User,
  Favorite,
  Marker,
  StatusDef,
  AuditEntry,
} from "../types";

export interface DataService {
  // ---------- Settings ----------
  getSettings(): Settings;
  updateSettings(
    patch: Partial<
      Pick<Settings, "fiscalYearStartMonth" | "allowedEmailDomains" | "orgName">
    >,
    actorId: ID | null
  ): Settings;

  // ---------- Statuses ----------
  listStatuses(): StatusDef[];
  createStatus(
    fields: { name: string; color: string },
    actorId: ID | null
  ): StatusDef;
  updateStatus(
    id: ID,
    patch: { name?: string; color?: string; position?: number },
    actorId: ID | null
  ): StatusDef;
  deleteStatus(id: ID, actorId: ID | null): void;

  // ---------- Users ----------
  listUsers(): User[];
  getUser(id: ID): User | null;
  findUserByEmail(email: string): User | null;
  createOrFindUser(email: string, displayName?: string): User;
  updateUser(id: ID, patch: { displayName?: string }, actorId: ID | null): User;
  // Record that a user has agreed to the given Privacy / Terms version.
  // Writes the version string and a timestamp on the user row and emits an
  // audit entry. Idempotent — calling twice with the same version is a no-op.
  recordTermsAcceptance(userId: ID, version: string): User;

  // ---------- Groups ----------
  listGroups(includeDeleted?: boolean): Group[];
  getGroup(id: ID): Group | null;
  createGroup(
    fields: { name: string; description?: string; parentGroupId?: ID | null },
    actorId: ID | null
  ): Group;
  updateGroup(
    id: ID,
    patch: { name?: string; description?: string; parentGroupId?: ID | null },
    actorId: ID | null
  ): Group;
  deleteGroup(id: ID, actorId: ID | null): void;

  // ---------- Roadmaps ----------
  listRoadmaps(groupId?: ID): Roadmap[];
  getRoadmap(id: ID): Roadmap | null;
  createRoadmap(
    groupId: ID,
    name: string,
    description: string,
    actorId: ID | null
  ): Roadmap;
  updateRoadmap(
    id: ID,
    patch: {
      name?: string;
      description?: string;
      timelineGranularity?: Granularity;
      quarterMode?: QuarterMode;
    },
    actorId: ID | null
  ): Roadmap;
  deleteRoadmap(id: ID, actorId: ID | null): void;

  // ---------- Swimlanes ----------
  listSwimlanes(roadmapId: ID): Swimlane[];
  createSwimlane(
    roadmapId: ID,
    name: string,
    description: string,
    actorId: ID | null
  ): Swimlane;
  updateSwimlane(
    id: ID,
    patch: { name?: string; description?: string; position?: number },
    actorId: ID | null
  ): Swimlane;
  deleteSwimlane(id: ID, actorId: ID | null): void;

  // ---------- Items ----------
  getItem(id: ID): Item | null;
  listItems(): Item[];
  createItem(
    homeRoadmapId: ID,
    fields: Partial<Item>,
    actorId: ID | null
  ): Item;
  updateItem(id: ID, patch: Partial<Item>, actorId: ID | null): Item;
  deleteItem(id: ID, actorId: ID | null): void;
  restoreItem(id: ID, actorId: ID | null): void;

  itemsForRoadmap(roadmapId: ID): RenderedItem[];

  // Move an item up or down in priority within its home roadmap. Swaps with
  // neighbor; refuses if already at the extreme.
  moveItemPriority(itemId: ID, direction: "up" | "down", actorId: ID | null): void;

  // Move an item up or down in *this roadmap's* local priority (separate from
  // the source team's ordering). Works for direct placements and for items
  // arriving via subscription.
  moveLocalPriority(
    itemId: ID,
    roadmapId: ID,
    direction: "up" | "down",
    actorId: ID | null
  ): void;

  // ---------- Sharing / placements ----------
  shareItemTo(itemId: ID, roadmapId: ID): void;
  removePlacement(itemId: ID, roadmapId: ID): void;
  isItemSharedTo(itemId: ID, roadmapId: ID): boolean;
  // Sets swimlane for an item on a roadmap. Works for direct placements AND
  // subscription-arrived items (via the subscribedItemLanePrefs table).
  setItemSwimlane(itemId: ID, roadmapId: ID, swimlaneId: ID | null): void;
  getItemSwimlane(itemId: ID, roadmapId: ID): ID | null;

  // ---------- Subscriptions ----------
  subscriptionsFor(roadmapId: ID): ID[];
  subscribersOf(roadmapId: ID): ID[];
  subscribe(subscriberId: ID, subscribedToId: ID): void;
  unsubscribe(subscriberId: ID, subscribedToId: ID): void;

  // ---------- Favorites ----------
  listFavorites(userId: ID): ID[];
  isFavorite(userId: ID, roadmapId: ID): boolean;
  addFavorite(userId: ID, roadmapId: ID): void;
  removeFavorite(userId: ID, roadmapId: ID): void;
  moveFavorite(userId: ID, roadmapId: ID, direction: "up" | "down"): void;

  // ---------- Markers ----------
  listMarkers(roadmapId: ID): Marker[];
  createMarker(
    roadmapId: ID,
    fields: { date: string; label: string; color: string },
    actorId: ID | null
  ): Marker;
  updateMarker(
    id: ID,
    patch: { date?: string; label?: string; color?: string },
    actorId: ID | null
  ): Marker;
  deleteMarker(id: ID, actorId: ID | null): void;

  // ---------- Audit log ----------
  listAuditFor(entity: string, entityId: ID): AuditEntry[];
  listRecentAudit(limit?: number): AuditEntry[];

  // ---------- Trash ----------
  trashedItems(): Item[];
  trashedRoadmaps(): Roadmap[];
  trashedGroups(): Group[];

  // ---------- Bulk ----------
  resetToSeed(): void;
  resetToEmpty(): void;
  exportSnapshot(): string;
}
