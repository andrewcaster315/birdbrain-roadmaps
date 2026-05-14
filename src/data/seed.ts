// Seed builders. buildSeed = demo data; buildEmpty = production-shape
// (just default settings, no users/groups/roadmaps yet).

import type {
  DataSnapshot,
  Item,
  Placement,
  Roadmap,
  Subscription,
  Swimlane,
  Group,
  User,
  Favorite,
  Marker,
  StatusDef,
} from "../types";
import { DEFAULT_STATUSES } from "../types";
import { newId, nowISO } from "../utils/id";

const makeStatuses = (): StatusDef[] =>
  DEFAULT_STATUSES.map((s) => ({ ...s, id: newId() }));

export const buildEmpty = (): DataSnapshot => ({
  settings: {
    fiscalYearStartMonth: 1,
    allowedEmailDomains: [],
    statuses: makeStatuses(),
    orgName: "Birdbrain Roadmaps",
  },
  users: [],
  groups: [],
  roadmaps: [],
  swimlanes: [],
  items: [],
  placements: [],
  subscribedItemLanePrefs: [],
  subscriptions: [],
  favorites: [],
  markers: [],
  audit: [],
});

export const buildSeed = (): DataSnapshot => {
  const statuses = makeStatuses();
  const planned = statuses.find((s) => s.name === "Planned")!.name;
  const inProg = statuses.find((s) => s.name === "In Progress")!.name;

  // Users
  const u = (email: string, displayName: string, isAdmin = false): User => ({
    id: newId(),
    email,
    displayName,
    isAdmin,
    termsVersionAccepted: null,
    termsAcceptedAt: null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    deletedAt: null,
  });
  const alex = u("alex@example.com", "Alex Park");
  const priya = u("priya@example.com", "Priya Rao");
  const jordan = u("jordan@example.com", "Jordan Lee");
  const sam = u("sam@example.com", "Sam Patel");
  const riley = u("riley@example.com", "Riley Chen");
  // Morgan is the seed admin so the AdminPage is usable on first sign-in.
  const morgan = u("morgan@example.com", "Morgan Hayes", true);
  const users = [alex, priya, jordan, sam, riley, morgan];

  // Groups
  const g = (name: string, description: string, parent: string | null = null): Group => ({
    id: newId(),
    name,
    description,
    parentGroupId: parent,
    createdById: morgan.id,
    updatedById: morgan.id,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    deletedAt: null,
  });
  const productOrg = g("Product", "Director's rollup of all Product work");
  const growth = g("Growth Product", "Acquisition, activation, referral", productOrg.id);
  const platform = g("Platform Product", "Foundations, infrastructure, APIs", productOrg.id);
  const onboardingProgram = g("Onboarding Overhaul", "Cross-team program improving onboarding", productOrg.id);
  const groups = [productOrg, growth, platform, onboardingProgram];

  // Roadmaps
  const r = (
    groupId: string,
    name: string,
    description: string,
    granularity: Roadmap["timelineGranularity"] = "months",
    actor: User = morgan
  ): Roadmap => ({
    id: newId(),
    groupId,
    name,
    description,
    timelineGranularity: granularity,
    quarterMode: "CY",
    createdById: actor.id,
    updatedById: actor.id,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    deletedAt: null,
  });
  const growthRoadmap = r(growth.id, "Growth — 2026 H2", "Primary roadmap for Growth Product", "months", alex);
  const platformRoadmap = r(platform.id, "Platform — 2026 H2", "Primary roadmap for Platform Product", "months", sam);
  const directorRollup = r(productOrg.id, "Director Rollup", "Cross-team view of all Product work", "quarters", morgan);
  const programRoadmap = r(onboardingProgram.id, "Onboarding Overhaul", "Cross-team program roadmap", "months", alex);
  const roadmaps = [growthRoadmap, platformRoadmap, directorRollup, programRoadmap];

  // Swimlanes
  const sl = (roadmapId: string, name: string, description: string, position: number): Swimlane => ({
    id: newId(),
    roadmapId,
    name,
    description,
    position,
    createdById: morgan.id,
    updatedById: morgan.id,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  });
  const growthAcq = sl(growthRoadmap.id, "Acquisition", "Top-of-funnel work", 0);
  const growthAct = sl(growthRoadmap.id, "Activation", "First-week experience", 1);
  const platformInfra = sl(platformRoadmap.id, "Infrastructure", "Platform foundations", 0);
  const platformApi = sl(platformRoadmap.id, "APIs", "Public + internal APIs", 1);
  // Director rollup gets its own swimlanes — the user wanted to be able to
  // place subscription-arrived items into custom lanes.
  const dirByOwner = sl(directorRollup.id, "By Team", "Items grouped by source team", 0);
  const dirCriticalPath = sl(directorRollup.id, "Critical Path", "Items I'm watching closely", 1);
  const swimlanes = [growthAcq, growthAct, platformInfra, platformApi, dirByOwner, dirCriticalPath];

  // Items
  // Track per-home-roadmap priority counters so the seed assigns 1, 2, 3...
  const priorityByRoadmap = new Map<string, number>();
  const nextPriority = (roadmapId: string) => {
    const n = (priorityByRoadmap.get(roadmapId) ?? 0) + 1;
    priorityByRoadmap.set(roadmapId, n);
    return n;
  };

  const i = (
    homeRoadmapId: string,
    title: string,
    fields: Partial<Item> & { actor?: User } = {}
  ): Item => ({
    id: newId(),
    homeRoadmapId,
    title,
    status: fields.status ?? planned,
    ownerId: fields.ownerId ?? null,
    ownerText: fields.ownerText ?? "",
    notes: fields.notes ?? "",
    startDate: fields.startDate ?? null,
    endDate: fields.endDate ?? null,
    dependsOnItemIds: fields.dependsOnItemIds ?? [],
    priority: fields.priority ?? nextPriority(homeRoadmapId),
    createdById: fields.actor?.id ?? morgan.id,
    updatedById: fields.actor?.id ?? morgan.id,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    deletedAt: null,
  });
  const onboardRedesign = i(growthRoadmap.id, "Onboarding redesign", {
    status: inProg, ownerId: alex.id,
    notes: "Cross-team initiative with Platform.",
    startDate: "2026-06-01", endDate: "2026-08-31", actor: alex,
  });
  const referralFlow = i(growthRoadmap.id, "Referral flow v2", {
    ownerId: priya.id, startDate: "2026-09-01", endDate: "2026-10-15", actor: priya,
  });
  const activationExp = i(growthRoadmap.id, "Activation experiments", {
    ownerId: jordan.id, startDate: "2026-07-15", endDate: "2026-09-30", actor: jordan,
  });
  const ssoMigration = i(platformRoadmap.id, "SSO migration", {
    status: inProg, ownerId: sam.id,
    startDate: "2026-05-01", endDate: "2026-07-31", actor: sam,
  });
  const eventPipeline = i(platformRoadmap.id, "Event pipeline rebuild", {
    ownerId: riley.id, startDate: "2026-08-01", endDate: "2026-12-15", actor: riley,
  });
  const onboardingApi = i(platformRoadmap.id, "Onboarding APIs", {
    status: inProg, ownerId: sam.id,
    notes: "Backs the onboarding redesign.",
    startDate: "2026-06-01", endDate: "2026-08-15", actor: sam,
  });
  // Demonstrate dependencies: onboarding redesign depends on the API it backs onto.
  onboardRedesign.dependsOnItemIds = [onboardingApi.id];
  const items = [onboardRedesign, referralFlow, activationExp, ssoMigration, eventPipeline, onboardingApi];

  const place = (
    roadmapId: string,
    itemId: string,
    swimlaneId: string | null,
    position: number
  ): Placement => {
    const item = items.find((it) => it.id === itemId);
    return {
      roadmapId,
      itemId,
      swimlaneId,
      // Default localPriority: equal to source priority for the home roadmap;
      // on non-home roadmaps it's still set so sorting works, viewer can change.
      localPriority: item?.priority ?? position + 1,
      position,
      createdAt: nowISO(),
    };
  };
  const placements: Placement[] = [
    place(growthRoadmap.id, onboardRedesign.id, growthAct.id, 0),
    place(growthRoadmap.id, referralFlow.id, growthAcq.id, 1),
    place(growthRoadmap.id, activationExp.id, growthAct.id, 2),
    place(platformRoadmap.id, ssoMigration.id, platformInfra.id, 0),
    place(platformRoadmap.id, eventPipeline.id, platformInfra.id, 1),
    place(platformRoadmap.id, onboardingApi.id, platformApi.id, 2),
    place(programRoadmap.id, onboardRedesign.id, null, 0),
    place(programRoadmap.id, onboardingApi.id, null, 1),
  ];

  const subscriptions: Subscription[] = [
    { subscriberRoadmapId: directorRollup.id, subscribedRoadmapId: growthRoadmap.id, createdAt: nowISO() },
    { subscriberRoadmapId: directorRollup.id, subscribedRoadmapId: platformRoadmap.id, createdAt: nowISO() },
  ];

  // Show off subscription-lane prefs: park a few sub-items in the director's lanes.
  const subscribedItemLanePrefs = [
    { subscriberRoadmapId: directorRollup.id, itemId: onboardRedesign.id, swimlaneId: dirCriticalPath.id, localPriority: 1, createdAt: nowISO() },
    { subscriberRoadmapId: directorRollup.id, itemId: ssoMigration.id, swimlaneId: dirCriticalPath.id, localPriority: 2, createdAt: nowISO() },
    { subscriberRoadmapId: directorRollup.id, itemId: referralFlow.id, swimlaneId: dirByOwner.id, localPriority: 3, createdAt: nowISO() },
    { subscriberRoadmapId: directorRollup.id, itemId: activationExp.id, swimlaneId: dirByOwner.id, localPriority: 4, createdAt: nowISO() },
  ];

  const favorites: Favorite[] = [
    { userId: morgan.id, roadmapId: directorRollup.id, position: 0, createdAt: nowISO() },
    { userId: alex.id, roadmapId: growthRoadmap.id, position: 0, createdAt: nowISO() },
    { userId: alex.id, roadmapId: programRoadmap.id, position: 1, createdAt: nowISO() },
  ];

  const markers: Marker[] = [
    {
      id: newId(), roadmapId: growthRoadmap.id, date: "2026-09-15", label: "Onboarding GA",
      color: "#16a34a", createdById: alex.id, updatedById: alex.id, createdAt: nowISO(), updatedAt: nowISO(),
    },
    {
      id: newId(), roadmapId: platformRoadmap.id, date: "2026-08-01", label: "Q3 review",
      color: "#7c3aed", createdById: sam.id, updatedById: sam.id, createdAt: nowISO(), updatedAt: nowISO(),
    },
  ];

  return {
    settings: {
      fiscalYearStartMonth: 1,
      allowedEmailDomains: [],
      statuses,
      orgName: "Birdbrain Roadmaps",
    },
    users,
    groups,
    roadmaps,
    swimlanes,
    items,
    placements,
    subscribedItemLanePrefs,
    subscriptions,
    favorites,
    markers,
    audit: [],
  };
};
