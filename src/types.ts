// Domain types — v7 model. Single-tenant (multi-tenant deferred until after
// the company-internal launch).

export type ID = string;

export const GRANULARITIES = ["weeks", "months", "quarters"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const QUARTER_MODES = ["CY", "FY"] as const;
export type QuarterMode = (typeof QUARTER_MODES)[number];

export interface StatusDef {
  id: ID;
  name: string;
  color: string;
  position: number;
}

// Status chip colors are used with white text at small (~10px) uppercase
// font, which is "small text" for WCAG contrast purposes (needs 4.5:1).
// Slightly darker shades than the global CSS variables for Planned and On
// Hold so the chips pass AA contrast.
export const DEFAULT_STATUSES: Omit<StatusDef, "id">[] = [
  { name: "Planned", color: "#475569", position: 0 },
  { name: "In Progress", color: "#2563eb", position: 1 },
  { name: "Done", color: "#047857", position: 2 },
  { name: "On Hold", color: "#92400e", position: 3 },
  { name: "Cancelled", color: "#4b5563", position: 4 },
];

export interface User {
  id: ID;
  email: string;
  displayName: string;
  // Which version of the Privacy Policy + Terms of Use the user has agreed
  // to, and when. Null = never accepted; will be prompted on next sign-in.
  termsVersionAccepted: string | null;
  termsAcceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// Bump this when material changes are made to the Privacy Policy or Terms
// of Use. Users whose stored value doesn't match are re-prompted on next
// page load to re-accept. Match the "Last updated" date in LegalPages.tsx.
export const CURRENT_TERMS_VERSION = "2026-05-14";

export interface Group {
  id: ID;
  name: string;
  description: string;
  parentGroupId: ID | null;
  createdById: ID | null;
  updatedById: ID | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Roadmap {
  id: ID;
  groupId: ID;
  name: string;
  description: string;
  timelineGranularity: Granularity;
  quarterMode: QuarterMode;
  createdById: ID | null;
  updatedById: ID | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Swimlane {
  id: ID;
  roadmapId: ID;
  name: string;
  description: string;
  position: number;
  createdById: ID | null;
  updatedById: ID | null;
  createdAt: string;
  updatedAt: string;
}

export interface Item {
  id: ID;
  homeRoadmapId: ID;
  title: string;
  status: string; // matches a StatusDef.name
  ownerId: ID | null;
  ownerText: string;
  notes: string;
  startDate: string | null;
  endDate: string | null;
  // IDs of items this one depends on. Free-form, no cycles enforced.
  dependsOnItemIds: ID[];
  // Priority rank within the home roadmap. 1-indexed; lower = higher priority.
  // Set by the source team; read-only on roadmaps that aren't the home.
  priority: number;
  createdById: ID | null;
  updatedById: ID | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// Direct (manual or home-roadmap) placement.
export interface Placement {
  roadmapId: ID;
  itemId: ID;
  swimlaneId: ID | null;
  // Per-roadmap priority. On the home roadmap this mirrors item.priority;
  // on roadmaps where the item was shared in, viewers can reorder
  // independently of the source team's ordering.
  localPriority: number;
  position: number;
  createdAt: string;
}

// Per-subscriber-roadmap swimlane override for a subscription-arrived item.
// Lets a director's roadmap park items in its own custom swimlanes without
// affecting the source roadmap.
export interface SubscribedItemLanePref {
  subscriberRoadmapId: ID;
  itemId: ID;
  swimlaneId: ID | null;
  // Null means "no explicit override; sort below direct items by source rank."
  localPriority: number | null;
  createdAt: string;
}

export interface Subscription {
  subscriberRoadmapId: ID;
  subscribedRoadmapId: ID;
  createdAt: string;
}

export interface Favorite {
  userId: ID;
  roadmapId: ID;
  position: number;
  createdAt: string;
}

export const MARKER_COLORS = [
  "#b91c1c", "#ea580c", "#ca8a04", "#16a34a",
  "#0284c7", "#7c3aed", "#475569",
] as const;

export interface Marker {
  id: ID;
  roadmapId: ID;
  date: string;
  label: string;
  color: string;
  createdById: ID | null;
  updatedById: ID | null;
  createdAt: string;
  updatedAt: string;
}

export interface RenderedItem {
  item: Item;
  viaSubscription: boolean;
  sourceRoadmapId: ID;
  swimlaneId: ID | null;
  // Priority within the current roadmap (placement.localPriority or the
  // computed default for subscription items).
  localPriority: number;
}

// Audit log: one row per change.
export const AUDIT_ACTIONS = [
  "created", "updated", "deleted", "restored",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITIES = [
  "item", "roadmap", "group", "swimlane", "marker",
  "user", "settings", "status",
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export interface AuditEntry {
  id: ID;
  entity: AuditEntity;
  entityId: ID;
  action: AuditAction;
  // For "updated", a small diff payload: { fieldName: { from, to } }.
  changes: Record<string, { from: unknown; to: unknown }> | null;
  // Snapshot of useful identifying info at the time of the action.
  summary: string;
  actorId: ID | null;
  createdAt: string;
}

export interface Settings {
  fiscalYearStartMonth: number; // 1..12
  allowedEmailDomains: string[];
  statuses: StatusDef[];
  // Org name shown in the header, sign-in screen, etc.
  orgName: string;
}

export interface DataSnapshot {
  settings: Settings;
  users: User[];
  groups: Group[];
  roadmaps: Roadmap[];
  swimlanes: Swimlane[];
  items: Item[];
  placements: Placement[];
  subscribedItemLanePrefs: SubscribedItemLanePref[];
  subscriptions: Subscription[];
  favorites: Favorite[];
  markers: Marker[];
  audit: AuditEntry[];
}
