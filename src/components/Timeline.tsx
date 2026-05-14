// Horizontal timeline. Owns its own toolbar (granularity, quarter mode, pan
// controls) so it's visually one unit. Sticky swimlane gutter, single Today
// overlay across all lanes, custom date markers, drag-to-move and
// drag-to-resize on bars. Click only opens the editor when no drag occurred.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type {
  Granularity,
  Item,
  Marker,
  QuarterMode,
  RenderedItem,
  StatusDef,
  Swimlane,
} from "../types";
import { GRANULARITIES } from "../types";
import {
  addDaysISO,
  addUnit,
  dayDiff,
  generateBuckets,
  labelForBucket,
  maxISO,
  minISO,
  startOfBucket,
  toDate,
  todayISO,
  toISO,
} from "../utils/dates";
import { useData } from "../data/DataContext";
import { useAuth } from "../auth/AuthContext";
import type { DataService } from "../data/service";
import styles from "./Timeline.module.css";

// Small inline lock icon — used to mark items that are read-only on the
// current roadmap (because the item lives on a different home roadmap).
const LockIcon = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="7" width="10" height="7" rx="1.2" />
    <path d="M5.5 7V5.2a2.5 2.5 0 015 0V7" />
  </svg>
);

const ownerLabel = (item: Item, service: DataService): string => {
  if (item.ownerId) {
    const u = service.getUser(item.ownerId);
    if (u) return u.displayName;
  }
  return item.ownerText || "";
};

import { RoadmapFilters, type RoadmapFilterState } from "./RoadmapFilters";

type Props = {
  granularity: Granularity;
  quarterMode: QuarterMode;
  fyStartMonth: number;
  rendered: RenderedItem[];
  swimlanes: Swimlane[];
  markers: Marker[];
  onItemClick: (item: Item) => void;
  onItemShare: (item: Item) => void;
  onItemRemove: (
    item: Item,
    viaSubscription: boolean,
    sourceRoadmapId: string
  ) => void;
  onSetGranularity: (g: Granularity) => void;
  onSetQuarterMode: (m: QuarterMode) => void;
  onManageMarkers: () => void;
  onManageSwimlanes: () => void;
  filterState: RoadmapFilterState;
  onSetFilterState: (s: RoadmapFilterState) => void;
  currentRoadmapId: string;
};

// Apply the tenant's configured color for a status, with a fallback that's
// visually distinct for items whose status no longer matches (renamed/deleted).
const statusStyle = (
  statuses: StatusDef[],
  statusName: string
): { background: string; color: string } => {
  const s = statuses.find((x) => x.name === statusName);
  if (!s) return { background: "#9ca3af", color: "#fff" };
  return { background: s.color, color: "#fff" };
};

const COL_PX: Record<Granularity, number> = {
  weeks: 90,
  months: 130,
  quarters: 180,
};

const VISIBLE_BUCKETS = 8;
const MIN_BAR_PX = 40;
const GUTTER_PX = 160;
const DRAG_THRESHOLD = 4;

type DragKind = "move" | "resize-start" | "resize-end";
type DragState = {
  kind: DragKind;
  itemId: string;
  origStart: string;
  origEnd: string;
  origSwimlaneId: string | null;
  pointerStartX: number;
  pointerStartY: number;
  curStart: string;
  curEnd: string;
  curSwimlaneId: string | null;
  active: boolean;
};

export const Timeline = ({
  granularity,
  quarterMode,
  fyStartMonth,
  rendered,
  swimlanes,
  markers,
  onItemClick,
  onItemShare,
  onItemRemove,
  onSetGranularity,
  onSetQuarterMode,
  onManageMarkers,
  onManageSwimlanes,
  filterState,
  onSetFilterState,
  currentRoadmapId,
}: Props) => {
  const { service } = useData();
  const statuses = service.listStatuses();
  const opts = { mode: quarterMode, fyStartMonth };

  // Apply filters to the rendered list. Items not matching the filter are
  // hidden from the timeline AND the list view.
  const ownerIdsOnRoadmap = useMemo(() => {
    const set = new Set<string>();
    for (const r of rendered) if (r.item.ownerId) set.add(r.item.ownerId);
    return Array.from(set);
  }, [rendered]);
  const ownerTextsOnRoadmap = useMemo(() => {
    const set = new Set<string>();
    for (const r of rendered) {
      if (!r.item.ownerId && r.item.ownerText) set.add(r.item.ownerText);
    }
    return Array.from(set);
  }, [rendered]);

  const filteredRendered = useMemo(() => {
    const q = filterState.query.trim().toLowerCase();
    return rendered.filter((r) => {
      if (q) {
        const hay = `${r.item.title} ${r.item.notes} ${r.item.ownerText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterState.statuses.size > 0 && !filterState.statuses.has(r.item.status))
        return false;
      if (filterState.ownerIds.size > 0 || filterState.ownerTexts.size > 0) {
        const idHit = !!r.item.ownerId && filterState.ownerIds.has(r.item.ownerId);
        const textHit =
          !r.item.ownerId &&
          r.item.ownerText &&
          filterState.ownerTexts.has(r.item.ownerText);
        if (!idHit && !textHit) return false;
      }
      if (filterState.swimlaneIds.size > 0) {
        const laneId = r.swimlaneId ?? "__none__";
        if (!filterState.swimlaneIds.has(laneId as any)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendered, filterState]);
  const colWidth = COL_PX[granularity];

  // Container width tracking
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  useEffect(() => {
    if (!scrollRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(scrollRef.current);
    return () => ro.disconnect();
  }, []);
  const visibleCount = Math.max(
    VISIBLE_BUCKETS,
    Math.ceil((containerWidth - GUTTER_PX) / colWidth) + 2
  );

  // Item + marker date range — derived from the FULL set so the view doesn't
  // jump around when the user filters.
  const dateRange = useMemo(() => {
    const dates: string[] = [];
    for (const r of rendered) {
      if (r.item.startDate) dates.push(r.item.startDate);
      if (r.item.endDate) dates.push(r.item.endDate);
    }
    for (const m of markers) dates.push(m.date);
    if (dates.length === 0) return null;
    return {
      min: dates.reduce((a, b) => (a < b ? a : b)),
      max: dates.reduce((a, b) => (a > b ? a : b)),
    };
  }, [rendered, markers]);

  // Initial view: ensure today is visible. Start at min(today, earliest) - 1 unit.
  const initialStart = useMemo(() => {
    const today = toDate(todayISO());
    if (!dateRange) {
      return addUnit(startOfBucket(today, granularity, opts), -1, granularity);
    }
    const earliest = toDate(dateRange.min);
    const reference = earliest < today ? earliest : today;
    return addUnit(startOfBucket(reference, granularity, opts), -1, granularity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granularity, quarterMode, fyStartMonth, dateRange]);

  const [viewStart, setViewStart] = useState<Date>(initialStart);
  useEffect(() => {
    setViewStart(initialStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granularity, quarterMode, fyStartMonth]);

  const pan = useCallback(
    (n: number) => setViewStart((s) => addUnit(s, n, granularity)),
    [granularity]
  );
  const goToToday = useCallback(() => {
    const today = toDate(todayISO());
    const aligned = startOfBucket(today, granularity, opts);
    const offset = -Math.floor(visibleCount / 4);
    setViewStart(addUnit(aligned, offset, granularity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granularity, quarterMode, fyStartMonth, visibleCount]);

  // Bucket array shown
  const columns = useMemo(
    () => generateBuckets(viewStart, visibleCount, granularity),
    [viewStart, visibleCount, granularity]
  );
  const totalWidth = colWidth * columns.length;
  const viewStartDate = columns[0];
  const viewEndDate = addUnit(columns[columns.length - 1], 1, granularity);
  const totalDays = dayDiff(viewStartDate, viewEndDate);

  const xOf = useCallback(
    (iso: string): number => {
      const d = toDate(iso);
      const days = dayDiff(viewStartDate, d);
      return (days / totalDays) * totalWidth;
    },
    [viewStartDate, totalDays, totalWidth]
  );

  const todayX = xOf(todayISO());
  const todayInRange = todayX >= 0 && todayX <= totalWidth;

  // Group items into lanes — user lanes first, Unassigned last (only if it has items).
  const lanesById = useMemo(() => {
    const m = new Map<string, Swimlane>();
    swimlanes.forEach((s) => m.set(s.id, s));
    return m;
  }, [swimlanes]);

  const grouped = useMemo(() => {
    const lanes = swimlanes.slice().sort((a, b) => a.position - b.position);
    const buckets: { lane: Swimlane | null; items: RenderedItem[] }[] = [];
    const unassigned: RenderedItem[] = [];
    const byLane = new Map<string, RenderedItem[]>();
    for (const r of filteredRendered) {
      const lid = r.swimlaneId;
      if (lid && lanesById.has(lid)) {
        const arr = byLane.get(lid) ?? [];
        arr.push(r);
        byLane.set(lid, arr);
      } else {
        unassigned.push(r);
      }
    }
    for (const lane of lanes) {
      buckets.push({ lane, items: byLane.get(lane.id) ?? [] });
    }
    if (unassigned.length > 0) buckets.push({ lane: null, items: unassigned });
    return buckets;
  }, [filteredRendered, swimlanes, lanesById]);

  // Pre-compute lane row counts to size lanes
  const laneHeights = useMemo(
    () =>
      grouped.map(({ items }) => {
        const scheduled = items.filter((r) => r.item.startDate && r.item.endDate);
        return Math.max(1, scheduled.length) * 36 + 12;
      }),
    [grouped]
  );

  // ---------- Drag handling ----------
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  // Set briefly after a drag completes so the synthetic click can be ignored.
  const wasDraggingRef = useRef(false);
  const containerEl = useRef<HTMLDivElement | null>(null);

  const startDrag = (
    e: React.PointerEvent,
    kind: DragKind,
    item: Item,
    swimlaneId: string | null
  ) => {
    if (!item.startDate || !item.endDate) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({
      kind,
      itemId: item.id,
      origStart: item.startDate,
      origEnd: item.endDate,
      origSwimlaneId: swimlaneId,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
      curStart: item.startDate,
      curEnd: item.endDate,
      curSwimlaneId: swimlaneId,
      active: false,
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.pointerStartX;
    const dy = e.clientY - d.pointerStartY;
    const active = d.active || Math.hypot(dx, dy) > DRAG_THRESHOLD;
    if (!active) return;

    const days = Math.round((dx / totalWidth) * totalDays);

    let curStart = d.origStart;
    let curEnd = d.origEnd;
    if (d.kind === "move") {
      curStart = addDaysISO(d.origStart, days);
      curEnd = addDaysISO(d.origEnd, days);
    } else if (d.kind === "resize-start") {
      curStart = minISO(addDaysISO(d.origStart, days), d.origEnd);
    } else if (d.kind === "resize-end") {
      curEnd = maxISO(addDaysISO(d.origEnd, days), d.origStart);
    }

    let curSwimlaneId = d.curSwimlaneId;
    if (d.kind === "move" && containerEl.current) {
      const laneEls = containerEl.current.querySelectorAll<HTMLElement>(
        "[data-lane-id]"
      );
      for (const el of Array.from(laneEls)) {
        const rect = el.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const id = el.dataset.laneId === "__none__" ? null : el.dataset.laneId!;
          curSwimlaneId = id;
          break;
        }
      }
    }
    setDrag({ ...d, active: true, curStart, curEnd, curSwimlaneId });
  };

  const finishDrag = (commit: boolean) => {
    const d = dragRef.current;
    if (!d) return;
    const wasActive = d.active;
    if (commit && wasActive) {
      const patch: { startDate?: string; endDate?: string } = {};
      if (d.curStart !== d.origStart) patch.startDate = d.curStart;
      if (d.curEnd !== d.origEnd) patch.endDate = d.curEnd;
      if (Object.keys(patch).length > 0) {
        try {
          service.updateItem(d.itemId, patch, null);
        } catch (err) {
          alert((err as Error).message);
        }
      }
      if (d.kind === "move" && d.curSwimlaneId !== d.origSwimlaneId) {
        try {
          service.setItemSwimlane(d.itemId, currentRoadmapId, d.curSwimlaneId);
        } catch (err) {
          alert((err as Error).message);
        }
      }
    }
    setDrag(null);
    if (wasActive) {
      // Suppress the synthetic click that fires after pointerup.
      wasDraggingRef.current = true;
      // Reset on the next macrotask (after the click event has dispatched).
      setTimeout(() => {
        wasDraggingRef.current = false;
      }, 0);
    }
  };

  const onBarKeyDown = (e: React.KeyboardEvent, item: Item) => {
    if (!item.startDate || !item.endDate) return;
    let dx = 0;
    if (e.key === "ArrowLeft") dx = -1;
    if (e.key === "ArrowRight") dx = 1;
    if (dx === 0) return;
    if (e.shiftKey) dx *= 7;
    e.preventDefault();
    const start = addDaysISO(item.startDate, dx);
    const end = addDaysISO(item.endDate, dx);
    service.updateItem(item.id, { startDate: start, endDate: end }, null);
  };

  const overlayHeight = laneHeights.reduce((a, b) => a + b, 0);

  // Pack marker (and Today) labels into stacked rows so they don't overlap.
  // Each label is center-aligned on its date; we find the first row where
  // its left edge is at least LABEL_PAD px past the previous label's right edge.
  const LABEL_ROW_HEIGHT = 22;
  const LABEL_PAD = 6;
  type PlacedLabel = {
    key: string;
    x: number;
    row: number;
    text: string;
    color: string;
    title: string;
    isToday: boolean;
  };
  const placedLabels = useMemo<PlacedLabel[]>(() => {
    const estimateWidth = (text: string) =>
      // 10px font; ~5.5px per char + 12px horizontal padding; capped at 140px max-width.
      Math.min(140, Math.max(28, text.length * 5.5 + 12));
    const rowRightEdges: number[] = [];
    const placed: PlacedLabel[] = [];

    const tryPlace = (
      key: string,
      x: number,
      text: string,
      color: string,
      title: string,
      isToday: boolean
    ) => {
      const w = estimateWidth(text);
      const left = x - w / 2;
      const right = x + w / 2;
      let row = 0;
      while (
        row < rowRightEdges.length &&
        rowRightEdges[row] !== undefined &&
        rowRightEdges[row] > left
      ) {
        row++;
      }
      rowRightEdges[row] = right + LABEL_PAD;
      placed.push({ key, x, row, text, color, title, isToday });
    };

    // Today gets first chance to claim row 0.
    if (todayInRange) {
      tryPlace("__today__", todayX, "Today", "#b91c1c", "Today", true);
    }
    for (const m of markers) {
      const x = xOf(m.date);
      if (x < 0 || x > totalWidth) continue;
      tryPlace(
        m.id,
        x,
        m.label || m.date.slice(5),
        m.color,
        `${m.label || "Marker"} — ${m.date}`,
        false
      );
    }
    return placed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayInRange, todayX, markers, totalWidth, xOf]);

  const labelRowCount = placedLabels.reduce(
    (m, p) => Math.max(m, p.row + 1),
    0
  );
  const markerStripHeight =
    labelRowCount > 0 ? labelRowCount * LABEL_ROW_HEIGHT + 4 : 0;

  // For weeks/months views, group columns by their containing quarter so we
  // can render a quarters row above the bucket header.
  const quarterGroups = useMemo(() => {
    if (granularity === "quarters") return [];
    const groups: { label: string; width: number; key: number }[] = [];
    for (const bucket of columns) {
      const qStart = startOfBucket(bucket, "quarters", opts);
      const key = qStart.getTime();
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.width += colWidth;
      } else {
        groups.push({
          label: labelForBucket(qStart, "quarters", opts),
          width: colWidth,
          key,
        });
      }
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, granularity, quarterMode, fyStartMonth, colWidth]);

  return (
    <div className={styles.wrap}>
      {/* Integrated toolbar attached to the timeline */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarLabel} id="t-gran-label">
            View
          </span>
          <div
            className={styles.toggleGroup}
            role="radiogroup"
            aria-labelledby="t-gran-label"
          >
            {GRANULARITIES.map((g) => (
              <button
                key={g}
                onClick={() => onSetGranularity(g)}
                className={
                  g === granularity ? styles.toggleActive : styles.toggle
                }
                role="radio"
                aria-checked={g === granularity}
              >
                {g}
              </button>
            ))}
          </div>
          <div
            className={styles.toggleGroup}
            role="radiogroup"
            aria-label="Quarter mode"
            title={
              granularity === "quarters"
                ? "Quarter labels"
                : "Quarter labels in the row above"
            }
          >
            <button
              onClick={() => onSetQuarterMode("CY")}
              className={
                quarterMode === "CY" ? styles.toggleActive : styles.toggle
              }
              role="radio"
              aria-checked={quarterMode === "CY"}
              title="Calendar year quarters"
            >
              CY
            </button>
            <button
              onClick={() => onSetQuarterMode("FY")}
              className={
                quarterMode === "FY" ? styles.toggleActive : styles.toggle
              }
              role="radio"
              aria-checked={quarterMode === "FY"}
              title={`Fiscal year quarters (FY starts in month ${fyStartMonth})`}
            >
              FY
            </button>
          </div>
        </div>

        <div className={styles.toolbarRight}>
          <RoadmapFilters
            state={filterState}
            onChange={onSetFilterState}
            swimlanes={swimlanes}
            ownerIdsOnRoadmap={ownerIdsOnRoadmap}
            ownerTextsOnRoadmap={ownerTextsOnRoadmap}
          />
          <div
            className={styles.panGroup}
            role="group"
            aria-label="Pan timeline"
          >
            <button
              className={styles.panBtn}
              onClick={() => pan(-Math.max(1, Math.floor(visibleCount / 2)))}
              aria-label="Pan back"
              title="Pan back"
            >
              ◀
            </button>
            <button
              className={styles.panBtn}
              onClick={goToToday}
              aria-label="Center on today"
              title="Center on today"
            >
              Today
            </button>
            <button
              className={styles.panBtn}
              onClick={() => pan(Math.max(1, Math.floor(visibleCount / 2)))}
              aria-label="Pan forward"
              title="Pan forward"
            >
              ▶
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable canvas */}
      <div
        className={styles.scroll}
        ref={scrollRef}
        onPointerMove={onPointerMove}
        onPointerUp={() => finishDrag(true)}
        onPointerCancel={() => finishDrag(false)}
      >
        <div
          className={styles.canvas}
          style={{ width: GUTTER_PX + totalWidth }}
          ref={containerEl}
        >
          {/* Quarter row above the bucket header (only on weeks/months views) */}
          {granularity !== "quarters" && quarterGroups.length > 0 && (
            <div className={styles.quarterRow}>
              <div
                className={`${styles.laneGutter} ${styles.stickyGutter} ${styles.headerGutter} ${styles.headerGutterTop}`}
                aria-hidden="true"
              />
              <div className={styles.headerCols} style={{ width: totalWidth }}>
                {quarterGroups.map((g, i) => (
                  <div
                    key={i}
                    className={styles.quarterCell}
                    style={{ width: g.width }}
                  >
                    {g.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bucket header row */}
          <div className={styles.headerRow}>
            <div
              className={`${styles.laneGutter} ${styles.stickyGutter} ${styles.headerGutter}`}
              aria-hidden="true"
            />
            <div className={styles.headerCols} style={{ width: totalWidth }}>
              {columns.map((c, i) => (
                <div
                  key={i}
                  className={styles.headerCell}
                  style={{ width: colWidth }}
                  role="columnheader"
                >
                  {labelForBucket(c, granularity, opts)}
                </div>
              ))}
            </div>
          </div>

          {/* Marker strip — Today + custom marker labels live here so they
              never overlap item bars. The vertical lines themselves still
              extend down through every lane via the overlay below. Labels are
              packed into stacked rows when they'd otherwise collide. */}
          {/* Important Dates strip — shown whenever Today is visible or any
              markers are placed. Gutter shows the label + a quick-add button. */}
          <div
            className={styles.markerStrip}
            style={{
              minHeight:
                placedLabels.length > 0 ? markerStripHeight : 32,
            }}
          >
            <div
              className={`${styles.laneGutter} ${styles.stickyGutter} ${styles.markerStripGutter}`}
            >
              <button
                type="button"
                className={styles.markerGutterBtn}
                onClick={onManageMarkers}
                title="Manage important dates"
              >
                <span>Important Dates</span>
                <span className={styles.markerAddIcon} aria-hidden="true">+</span>
              </button>
            </div>
            <div
              className={styles.markerStripCanvas}
              style={{
                width: totalWidth,
                height:
                  placedLabels.length > 0 ? markerStripHeight : 32,
              }}
            >
              {/* Lines: rendered first (under labels) and tall enough to
                  reach the bottom of every swimlane below. They live inside
                  the strip canvas so each line visually starts at its label.
                  z-index 0 keeps them behind item bars in the lanes. */}
              {todayInRange && (
                <div
                  className={styles.todayLine}
                  style={{
                    left: todayX,
                    height:
                      (placedLabels.length > 0 ? markerStripHeight : 32) +
                      overlayHeight,
                  }}
                  aria-hidden="true"
                />
              )}
              {markers.map((m) => {
                const x = xOf(m.date);
                if (x < 0 || x > totalWidth) return null;
                return (
                  <div
                    key={m.id}
                    className={styles.markerLine}
                    style={{
                      left: x,
                      borderColor: m.color,
                      height:
                        (placedLabels.length > 0 ? markerStripHeight : 32) +
                        overlayHeight,
                    }}
                    aria-hidden="true"
                  />
                );
              })}
              {/* Labels render on top of their respective line starting points */}
              {placedLabels.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={
                    p.isToday ? styles.todayLabel : styles.markerLabel
                  }
                  style={{
                    left: p.x,
                    top: p.row * LABEL_ROW_HEIGHT + 3,
                    background: p.color,
                  }}
                  title={p.title}
                  onClick={p.isToday ? undefined : onManageMarkers}
                  aria-label={p.isToday ? "Today" : `Edit ${p.text}`}
                >
                  {p.text}
                </button>
              ))}
            </div>
          </div>

          {/* Lanes + an absolute overlay on top for the today line and markers */}
          <div className={styles.lanes}>
            {grouped.length === 0 && (
              <div className={styles.lane} style={{ minHeight: 80 }}>
                <div className={`${styles.laneLabel} ${styles.stickyGutter}`}>
                  <div className={styles.laneName}>Unassigned</div>
                </div>
                <div
                  className={styles.laneCanvas}
                  style={{ width: totalWidth, minHeight: 80 }}
                />
              </div>
            )}
            {grouped.map(({ lane, items }, laneIdx) => {
              const scheduled = items.filter(
                (r) => r.item.startDate && r.item.endDate
              );
              return (
                <div
                  key={lane?.id ?? "__none__"}
                  className={styles.lane}
                  data-lane-id={lane?.id ?? "__none__"}
                  aria-label={lane ? `Swimlane ${lane.name}` : "Unassigned"}
                  style={{ minHeight: laneHeights[laneIdx] }}
                >
                  <div className={`${styles.laneLabel} ${styles.stickyGutter}`}>
                    <div className={styles.laneName}>
                      {lane ? lane.name : "Unassigned"}
                    </div>
                    {lane?.description && (
                      <div className={styles.laneDesc}>{lane.description}</div>
                    )}
                  </div>
                  <div
                    className={styles.laneCanvas}
                    style={{
                      width: totalWidth,
                      minHeight: laneHeights[laneIdx],
                    }}
                  >
                    {/* Vertical gridlines */}
                    {columns.map((_, i) => (
                      <div
                        key={i}
                        className={styles.gridCol}
                        style={{ left: i * colWidth, width: colWidth }}
                      />
                    ))}
                    {/* Item bars */}
                    {scheduled.map((r, idx) => {
                      const isDragging =
                        drag?.itemId === r.item.id && drag.active;
                      const start = isDragging
                        ? drag!.curStart
                        : r.item.startDate!;
                      const end = isDragging ? drag!.curEnd : r.item.endDate!;
                      const left = xOf(start);
                      const right = xOf(end);
                      const width = Math.max(MIN_BAR_PX, right - left);
                      if (
                        isDragging &&
                        drag!.kind === "move" &&
                        drag!.curSwimlaneId !== (lane?.id ?? null)
                      ) {
                        return null;
                      }
                      return (
                        <div
                          key={r.item.id}
                          className={styles.barRow}
                          style={{ top: idx * 36 + 6 }}
                        >
                          <div
                            className={`${styles.bar} ${
                              r.viaSubscription ? styles.barSubscribed : ""
                            } ${
                              r.item.homeRoadmapId !== currentRoadmapId
                                ? styles.barReadonly
                                : ""
                            }`}
                            style={{ left, width, ...statusStyle(statuses, r.item.status) }}
                            role="button"
                            tabIndex={0}
                            aria-label={`${r.item.title}, ${r.item.status}, ${start} to ${end}${
                              r.viaSubscription ? ", via subscription" : ""
                            }. Press Enter to edit.`}
                            title={`${r.item.title} (${start} → ${end})${
                              r.viaSubscription ? " — via subscription" : ""
                            }`}
                            onPointerDown={(e) => {
                              // Only the home roadmap can move/resize the item.
                              if (r.item.homeRoadmapId !== currentRoadmapId)
                                return;
                              startDrag(e, "move", r.item, lane?.id ?? null);
                            }}
                            onClick={(e) => {
                              if (wasDraggingRef.current) {
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              onItemClick(r.item);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onItemClick(r.item);
                              } else if (
                                r.item.homeRoadmapId === currentRoadmapId
                              ) {
                                onBarKeyDown(e, r.item);
                              }
                            }}
                          >
                            {r.item.homeRoadmapId === currentRoadmapId && (
                              <>
                                <div
                                  className={styles.handleLeft}
                                  onPointerDown={(e) =>
                                    startDrag(
                                      e,
                                      "resize-start",
                                      r.item,
                                      lane?.id ?? null
                                    )
                                  }
                                  aria-hidden="true"
                                />
                                <div
                                  className={styles.handleRight}
                                  onPointerDown={(e) =>
                                    startDrag(
                                      e,
                                      "resize-end",
                                      r.item,
                                      lane?.id ?? null
                                    )
                                  }
                                  aria-hidden="true"
                                />
                              </>
                            )}
                            <span className={styles.barTitle}>
                              {r.item.title}
                            </span>
                            {ownerLabel(r.item, service) && (
                              <span className={styles.barOwner}>
                                · {ownerLabel(r.item, service)}
                              </span>
                            )}
                            {r.item.homeRoadmapId !== currentRoadmapId && (
                              <span
                                className={styles.barTag}
                                aria-label="Read-only — sourced from another roadmap"
                                title={
                                  r.viaSubscription
                                    ? "Read-only — pulled in via subscription. Open the source roadmap to edit."
                                    : "Read-only — shared from another roadmap. Open the source roadmap to edit."
                                }
                              >
                                <LockIcon />
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Inline "Add swimlane" row — sits below all existing lanes so
                creating a new lane feels like a natural extension of the list. */}
            <div className={styles.addLaneRow}>
              <div
                className={`${styles.laneLabel} ${styles.stickyGutter}`}
              >
                <button
                  type="button"
                  className={styles.addLaneBtn}
                  onClick={onManageSwimlanes}
                  title="Add or edit swimlanes"
                >
                  + Add swimlane
                </button>
              </div>
              <div
                className={styles.addLaneCanvas}
                style={{ width: totalWidth }}
              />
            </div>

            {/* (Lines render in the marker strip above and extend down
                through the lanes — no separate overlay needed.) */}
          </div>
        </div>
      </div>

      <ItemListView
        rendered={filteredRendered}
        onItemClick={onItemClick}
        onItemShare={onItemShare}
        onItemRemove={onItemRemove}
        currentRoadmapId={currentRoadmapId}
        lanesById={lanesById}
      />
    </div>
  );
};

const ItemListView = ({
  rendered,
  onItemClick,
  onItemShare,
  onItemRemove,
  currentRoadmapId,
  lanesById,
}: {
  rendered: RenderedItem[];
  onItemClick: (item: Item) => void;
  onItemShare: (item: Item) => void;
  onItemRemove: (
    item: Item,
    viaSubscription: boolean,
    sourceRoadmapId: string
  ) => void;
  currentRoadmapId: string;
  lanesById: Map<string, Swimlane>;
}) => {
  const { service } = useData();
  const { currentUser } = useAuth();
  const statuses = service.listStatuses();
  if (rendered.length === 0) return null;

  // Sort by this roadmap's local priority. Source priority remains visible
  // on each row as a secondary label for non-home items.
  const sorted = useMemo(() => {
    const arr = rendered.slice();
    arr.sort((a, b) => a.localPriority - b.localPriority);
    return arr;
  }, [rendered]);

  return (
    <div className={styles.itemList} role="table" aria-label="Items">
      <div className={styles.itemListHeader} role="row">
        <div className={styles.priCol} role="columnheader" title="Priority on this roadmap">#</div>
        <div role="columnheader">Title</div>
        <div className={styles.cellHide} role="columnheader">Status</div>
        <div className={styles.cellHide} role="columnheader">Owner</div>
        <div className={styles.cellHide} role="columnheader">Lane</div>
        <div className={styles.cellHide} role="columnheader">Dates</div>
        <div role="columnheader">Actions</div>
      </div>
      {sorted.map((r, idx) => {
        const isHome = r.item.homeRoadmapId === currentRoadmapId;
        const sourceName = !isHome
          ? service.getRoadmap(r.item.homeRoadmapId)?.name ?? null
          : null;
        const canMoveUp = idx > 0;
        const canMoveDown = idx < sorted.length - 1;
        return (
          <div key={r.item.id} className={styles.itemListRow} role="row">
            <div className={styles.priCol} role="cell">
              <div className={styles.priRow}>
                <div className={styles.priReorder}>
                  <button
                    type="button"
                    className={styles.priReorderBtn}
                    onClick={() =>
                      service.moveLocalPriority(
                        r.item.id,
                        currentRoadmapId,
                        "up",
                        currentUser?.id ?? null
                      )
                    }
                    disabled={!canMoveUp}
                    aria-label={`Move ${r.item.title} up`}
                    title="Move up on this roadmap"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className={styles.priReorderBtn}
                    onClick={() =>
                      service.moveLocalPriority(
                        r.item.id,
                        currentRoadmapId,
                        "down",
                        currentUser?.id ?? null
                      )
                    }
                    disabled={!canMoveDown}
                    aria-label={`Move ${r.item.title} down`}
                    title="Move down on this roadmap"
                  >
                    ▼
                  </button>
                </div>
                <span className={styles.priNum}>{r.localPriority}</span>
              </div>
              {sourceName && (
                <span
                  className={styles.priSource}
                  title={`Source team priority on ${sourceName}`}
                >
                  src #{r.item.priority ?? "—"} · {sourceName}
                </span>
              )}
            </div>
            <button
              className={styles.itemTitleBtn}
              onClick={() => onItemClick(r.item)}
              role="cell"
            >
              {r.item.title}
              {r.viaSubscription && (
                <span className={styles.subBadge}>via subscription</span>
              )}
            </button>
            <div className={styles.cellHide} role="cell">
              <select
                className={styles.inlineSelect}
                value={r.item.status}
                disabled={!isHome}
                title={
                  isHome
                    ? "Change status"
                    : "Status is managed on the item's home roadmap"
                }
                style={statusStyle(statuses, r.item.status)}
                onChange={(e) =>
                  service.updateItem(
                    r.item.id,
                    { status: e.target.value },
                    currentUser?.id ?? null
                  )
                }
                aria-label={`${r.item.title} status`}
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.cellHide} role="cell">
              <select
                className={styles.inlineSelect}
                value={r.item.ownerId ?? ""}
                disabled={!isHome}
                title={
                  isHome
                    ? "Change owner"
                    : "Owner is managed on the item's home roadmap"
                }
                onChange={(e) =>
                  service.updateItem(
                    r.item.id,
                    {
                      ownerId: e.target.value || null,
                      // Clear the free-text fallback when picking a real user.
                      ownerText: e.target.value ? "" : r.item.ownerText,
                    },
                    currentUser?.id ?? null
                  )
                }
                aria-label={`${r.item.title} owner`}
              >
                <option value="">
                  {r.item.ownerText
                    ? r.item.ownerText
                    : "Unassigned"}
                </option>
                {service.listUsers().map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.cellHide} role="cell">
              <select
                className={styles.inlineSelect}
                value={r.swimlaneId ?? ""}
                title="Move to a different lane on this roadmap"
                onChange={(e) =>
                  service.setItemSwimlane(
                    r.item.id,
                    currentRoadmapId,
                    e.target.value || null
                  )
                }
                aria-label={`${r.item.title} lane`}
              >
                <option value="">Unassigned</option>
                {Array.from(lanesById.values()).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.cellHide} role="cell">
              <div className={styles.dateRange}>
                <input
                  type="date"
                  className={styles.inlineDate}
                  value={r.item.startDate ?? ""}
                  disabled={!isHome}
                  title={
                    isHome
                      ? "Start date"
                      : "Dates are managed on the item's home roadmap"
                  }
                  onChange={(e) =>
                    service.updateItem(
                      r.item.id,
                      { startDate: e.target.value || null },
                      currentUser?.id ?? null
                    )
                  }
                  aria-label={`${r.item.title} start date`}
                />
                <span className={styles.dateArrow}>→</span>
                <input
                  type="date"
                  className={styles.inlineDate}
                  value={r.item.endDate ?? ""}
                  disabled={!isHome}
                  title={
                    isHome
                      ? "End date"
                      : "Dates are managed on the item's home roadmap"
                  }
                  onChange={(e) =>
                    service.updateItem(
                      r.item.id,
                      { endDate: e.target.value || null },
                      currentUser?.id ?? null
                    )
                  }
                  aria-label={`${r.item.title} end date`}
                />
              </div>
            </div>
            <div className={styles.actionCell} role="cell">
              <button
                className={styles.actionBtn}
                onClick={() => onItemShare(r.item)}
                disabled={!isHome}
                title={
                  !isHome
                    ? "Sharing is managed from the source roadmap"
                    : "Share to another roadmap"
                }
              >
                Share
              </button>
              <button
                className={styles.actionBtn}
                onClick={() =>
                  onItemRemove(r.item, r.viaSubscription, r.sourceRoadmapId)
                }
                disabled={r.viaSubscription || isHome}
                title={
                  r.viaSubscription
                    ? "Items arriving via subscription can't be removed individually — unsubscribe instead"
                    : isHome
                    ? "This is the item's home roadmap. Use Delete item to remove it everywhere."
                    : "Remove this item from this roadmap"
                }
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
