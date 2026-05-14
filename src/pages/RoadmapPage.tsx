import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useData } from "../data/DataContext";
import { useAuth } from "../auth/AuthContext";
import type { Granularity, Item, QuarterMode, RenderedItem } from "../types";
import { Timeline } from "../components/Timeline";
import { ItemEditor } from "../components/ItemEditor";
import { ShareDialog } from "../components/ShareDialog";
import { SubscribeDialog } from "../components/SubscribeDialog";
import { SwimlaneManager } from "../components/SwimlaneManager";
import { MarkerManager } from "../components/MarkerManager";
import { InlineEdit } from "../components/InlineEdit";
import { FavoriteStar } from "../components/FavoriteStar";
import { confirmDialog } from "../components/ConfirmDialog";
import { pushToast } from "../components/Toaster";
import {
  emptyFilterState,
  type RoadmapFilterState,
} from "../components/RoadmapFilters";
import styles from "./RoadmapPage.module.css";

export const RoadmapPage = () => {
  const { roadmapId } = useParams<{ roadmapId: string }>();
  const { service } = useData();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const roadmap = roadmapId ? service.getRoadmap(roadmapId) : null;
  const group = roadmap ? service.getGroup(roadmap.groupId) : null;
  const items: RenderedItem[] = roadmap ? service.itemsForRoadmap(roadmap.id) : [];
  const subs = roadmap ? service.subscriptionsFor(roadmap.id) : [];
  const subscribers = roadmap ? service.subscribersOf(roadmap.id) : [];
  const swimlanes = roadmap ? service.listSwimlanes(roadmap.id) : [];
  const markers = roadmap ? service.listMarkers(roadmap.id) : [];
  const settings = service.getSettings();

  const [editingItem, setEditingItem] = useState<Item | null | "new">(null);
  const [sharingItem, setSharingItem] = useState<Item | null>(null);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [showSwimlanes, setShowSwimlanes] = useState(false);
  const [showMarkers, setShowMarkers] = useState(false);
  const [filterState, setFilterState] = useState<RoadmapFilterState>(
    emptyFilterState()
  );

  if (!roadmap) {
    return (
      <div className={styles.wrap}>
        <div className={styles.empty}>Roadmap not found.</div>
        <Link to="/">← back to home</Link>
      </div>
    );
  }

  const setGranularity = (g: Granularity) =>
    service.updateRoadmap(
      roadmap.id,
      { timelineGranularity: g },
      currentUser?.id ?? null
    );
  const setQuarterMode = (m: QuarterMode) =>
    service.updateRoadmap(
      roadmap.id,
      { quarterMode: m },
      currentUser?.id ?? null
    );

  const onDeleteRoadmap = async () => {
    const ok = await confirmDialog({
      title: `Delete roadmap "${roadmap.name}"?`,
      message: "You can restore it from Trash within 30 days.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) {
      service.deleteRoadmap(roadmap.id, currentUser?.id ?? null);
      navigate(group ? `/groups/${group.id}` : "/");
    }
  };

  return (
    <div className={styles.wrap}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        {group && (
          <>
            <span aria-hidden="true"> / </span>
            <Link to={`/groups/${group.id}`}>{group.name}</Link>
          </>
        )}
      </nav>

      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>
              <InlineEdit
                value={roadmap.name}
                ariaLabel="Roadmap name"
                variant="title"
                onCommit={(next) =>
                  service.updateRoadmap(
                    roadmap.id,
                    { name: next },
                    currentUser?.id ?? null
                  )
                }
              />
            </h1>
            <FavoriteStar roadmapId={roadmap.id} size="md" />
          </div>
          <div className={styles.description}>
            <InlineEdit
              value={roadmap.description}
              ariaLabel="Roadmap description"
              variant="subtitle"
              emptyText="Add a description"
              multiline
              onCommit={(next) =>
                service.updateRoadmap(
                  roadmap.id,
                  { description: next },
                  currentUser?.id ?? null
                )
              }
            />
          </div>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.secondary}
            onClick={() => setShowSubscribe(true)}
            title="Manage which other roadmaps this one mirrors items from"
          >
            Linked roadmaps{" "}
            {(subs.length > 0 || subscribers.length > 0) && (
              <span className={styles.badge}>
                {subs.length}↓ {subscribers.length}↑
              </span>
            )}
          </button>
          <button className={styles.danger} onClick={onDeleteRoadmap}>
            Delete
          </button>
          <button
            className={styles.primary}
            onClick={() => setEditingItem("new")}
          >
            + Item
          </button>
        </div>
      </div>

      {items.length === 0 && (
        <div className={styles.emptyHint} role="status">
          <strong>This roadmap is empty.</strong>{" "}
          Click <strong>+ Item</strong> above to add your first one.
          Items get a title, owner, dates, status, and a swimlane.
        </div>
      )}

      <Timeline
        granularity={roadmap.timelineGranularity}
        quarterMode={roadmap.quarterMode}
        fyStartMonth={settings.fiscalYearStartMonth}
        rendered={items}
        swimlanes={swimlanes}
        markers={markers}
        onItemClick={(it) => setEditingItem(it)}
        onItemShare={(it) => setSharingItem(it)}
        onItemRemove={async (it, viaSubscription) => {
          if (viaSubscription) return;
          if (it.homeRoadmapId === roadmap.id) {
            pushToast({
              kind: "error",
              message:
                "This is the item's home roadmap. Use Delete item to remove it everywhere.",
            });
            return;
          }
          const ok = await confirmDialog({
            title: `Remove "${it.title}" from this roadmap?`,
            message: "It still exists on its home roadmap.",
            confirmLabel: "Remove",
            variant: "danger",
          });
          if (ok) {
            service.removePlacement(it.id, roadmap.id);
          }
        }}
        onSetGranularity={setGranularity}
        onSetQuarterMode={setQuarterMode}
        onManageMarkers={() => setShowMarkers(true)}
        onManageSwimlanes={() => setShowSwimlanes(true)}
        filterState={filterState}
        onSetFilterState={setFilterState}
        currentRoadmapId={roadmap.id}
      />

      {editingItem !== null && (
        <ItemEditor
          item={editingItem === "new" ? null : editingItem}
          roadmap={roadmap}
          swimlanes={swimlanes}
          onClose={() => setEditingItem(null)}
        />
      )}
      {sharingItem && (
        <ShareDialog
          item={sharingItem}
          currentRoadmapId={roadmap.id}
          onClose={() => setSharingItem(null)}
        />
      )}
      {showSubscribe && (
        <SubscribeDialog
          roadmapId={roadmap.id}
          onClose={() => setShowSubscribe(false)}
        />
      )}
      {showSwimlanes && (
        <SwimlaneManager
          roadmapId={roadmap.id}
          onClose={() => setShowSwimlanes(false)}
        />
      )}
      {showMarkers && (
        <MarkerManager
          roadmapId={roadmap.id}
          onClose={() => setShowMarkers(false)}
        />
      )}
    </div>
  );
};
