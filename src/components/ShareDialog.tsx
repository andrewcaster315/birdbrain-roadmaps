import { useRef } from "react";
import { useData } from "../data/DataContext";
import type { Item } from "../types";
import { useFocusTrap } from "../utils/useFocusTrap";
import { pushToast } from "./Toaster";
import styles from "./ShareDialog.module.css";

type Props = {
  item: Item;
  currentRoadmapId: string;
  onClose: () => void;
};

export const ShareDialog = ({ item, currentRoadmapId, onClose }: Props) => {
  const { service } = useData();
  const allRoadmaps = service.listRoadmaps();
  const homeRoadmap = service.getRoadmap(item.homeRoadmapId);

  const candidates = allRoadmaps.filter((r) => r.id !== item.homeRoadmapId);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, { onEscape: onClose });

  const toggle = (roadmapId: string) => {
    if (service.isItemSharedTo(item.id, roadmapId)) {
      try {
        service.removePlacement(item.id, roadmapId);
      } catch (err) {
        pushToast({ kind: "error", message: (err as Error).message });
      }
    } else {
      service.shareItemTo(item.id, roadmapId);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        ref={dialogRef}
      >
        <h2 id="share-title" className={styles.title}>
          Share item
        </h2>
        <div className={styles.subtitle}>
          <strong>{item.title}</strong>
        </div>
        {homeRoadmap && (
          <div className={styles.note}>
            Home roadmap: <strong>{homeRoadmap.name}</strong> — always present here.
          </div>
        )}

        <div className={styles.list}>
          {candidates.length === 0 && (
            <div className={styles.empty}>No other roadmaps to share to.</div>
          )}
          {candidates.map((r) => {
            const checked = service.isItemSharedTo(item.id, r.id);
            const team = service.getGroup(r.groupId);
            return (
              <label key={r.id} className={styles.row}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(r.id)}
                  aria-label={`Share to ${r.name}`}
                />
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>{r.name}</div>
                  <div className={styles.rowMeta}>
                    {team?.name ?? "—"} · {r.timelineGranularity}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div className={styles.actions}>
          <button className={styles.primary} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
