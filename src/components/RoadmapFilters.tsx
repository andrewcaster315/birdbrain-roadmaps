// Compact filter bar for the timeline. Folds open from a single button so
// the toolbar stays clean by default.

import { useEffect, useRef, useState } from "react";
import { useData } from "../data/DataContext";
import type { ID, Swimlane } from "../types";
import styles from "./RoadmapFilters.module.css";

export type RoadmapFilterState = {
  query: string;
  statuses: Set<string>; // status names
  ownerIds: Set<ID>; // user ids; empty set = all
  ownerTexts: Set<string>; // free-text owners; empty set = all
  swimlaneIds: Set<ID | "__none__">; // includes __none__ for unassigned; empty = all
};

export const emptyFilterState = (): RoadmapFilterState => ({
  query: "",
  statuses: new Set(),
  ownerIds: new Set(),
  ownerTexts: new Set(),
  swimlaneIds: new Set(),
});

export const isFilterActive = (f: RoadmapFilterState) =>
  f.query.trim() !== "" ||
  f.statuses.size > 0 ||
  f.ownerIds.size > 0 ||
  f.ownerTexts.size > 0 ||
  f.swimlaneIds.size > 0;

type Props = {
  state: RoadmapFilterState;
  onChange: (next: RoadmapFilterState) => void;
  swimlanes: Swimlane[];
  // Owners and statuses currently in use on this roadmap (for the picker).
  ownerIdsOnRoadmap: ID[];
  ownerTextsOnRoadmap: string[];
};

export const RoadmapFilters = ({
  state,
  onChange,
  swimlanes,
  ownerIdsOnRoadmap,
  ownerTextsOnRoadmap,
}: Props) => {
  const { service } = useData();
  const statuses = service.listStatuses();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = <T extends string>(set: Set<T>, val: T): Set<T> => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  };

  const activeCount =
    (state.query.trim() ? 1 : 0) +
    state.statuses.size +
    state.ownerIds.size +
    state.ownerTexts.size +
    state.swimlaneIds.size;

  return (
    <div className={styles.wrap} ref={popRef}>
      <input
        type="search"
        placeholder="Search this roadmap…"
        value={state.query}
        onChange={(e) => onChange({ ...state, query: e.target.value })}
        className={styles.search}
        aria-label="Search items on this roadmap"
      />
      <button
        type="button"
        className={
          activeCount > 0 ? styles.filterBtnActive : styles.filterBtn
        }
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Filter items"
      >
        Filter
        {activeCount > 0 && <span className={styles.activeBadge}>{activeCount}</span>}
      </button>
      {activeCount > 0 && (
        <button
          type="button"
          className={styles.clearBtn}
          onClick={() => onChange(emptyFilterState())}
          title="Clear all filters"
        >
          Clear
        </button>
      )}
      {open && (
        <div className={styles.popover} role="dialog" aria-label="Filters">
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Status</div>
            <div className={styles.chipRow}>
              {statuses.map((s) => {
                const on = state.statuses.has(s.name);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={on ? styles.chipOn : styles.chip}
                    style={
                      on
                        ? { background: s.color, color: "#fff", borderColor: s.color }
                        : undefined
                    }
                    onClick={() =>
                      onChange({
                        ...state,
                        statuses: toggle(state.statuses, s.name),
                      })
                    }
                    aria-pressed={on}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>

          {(ownerIdsOnRoadmap.length > 0 || ownerTextsOnRoadmap.length > 0) && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Owner</div>
              <div className={styles.chipRow}>
                {ownerIdsOnRoadmap.map((uid) => {
                  const u = service.getUser(uid);
                  if (!u) return null;
                  const on = state.ownerIds.has(uid);
                  return (
                    <button
                      key={uid}
                      type="button"
                      className={on ? styles.chipOn : styles.chip}
                      onClick={() =>
                        onChange({
                          ...state,
                          ownerIds: toggle(state.ownerIds, uid),
                        })
                      }
                      aria-pressed={on}
                    >
                      {u.displayName}
                    </button>
                  );
                })}
                {ownerTextsOnRoadmap.map((text) => {
                  const on = state.ownerTexts.has(text);
                  return (
                    <button
                      key={text}
                      type="button"
                      className={on ? styles.chipOn : styles.chip}
                      onClick={() =>
                        onChange({
                          ...state,
                          ownerTexts: toggle(state.ownerTexts, text),
                        })
                      }
                      aria-pressed={on}
                    >
                      {text}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Swimlane</div>
            <div className={styles.chipRow}>
              {swimlanes.map((sl) => {
                const on = state.swimlaneIds.has(sl.id);
                return (
                  <button
                    key={sl.id}
                    type="button"
                    className={on ? styles.chipOn : styles.chip}
                    onClick={() =>
                      onChange({
                        ...state,
                        swimlaneIds: toggle(state.swimlaneIds, sl.id),
                      })
                    }
                    aria-pressed={on}
                  >
                    {sl.name}
                  </button>
                );
              })}
              <button
                type="button"
                className={
                  state.swimlaneIds.has("__none__") ? styles.chipOn : styles.chip
                }
                onClick={() =>
                  onChange({
                    ...state,
                    swimlaneIds: toggle(state.swimlaneIds, "__none__"),
                  })
                }
                aria-pressed={state.swimlaneIds.has("__none__")}
              >
                Unassigned
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
