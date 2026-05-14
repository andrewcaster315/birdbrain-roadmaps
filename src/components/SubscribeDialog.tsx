import { useRef } from "react";
import { Link } from "react-router-dom";
import { useData } from "../data/DataContext";
import { useFocusTrap } from "../utils/useFocusTrap";
import styles from "./SubscribeDialog.module.css";

type Props = {
  roadmapId: string;
  onClose: () => void;
};

export const SubscribeDialog = ({ roadmapId, onClose }: Props) => {
  const { service } = useData();
  const allRoadmaps = service.listRoadmaps();
  const candidates = allRoadmaps.filter((r) => r.id !== roadmapId);
  const subbed = new Set(service.subscriptionsFor(roadmapId));
  const subscriberIds = new Set(service.subscribersOf(roadmapId));
  const subscribers = allRoadmaps.filter((r) => subscriberIds.has(r.id));
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, { onEscape: onClose });

  const toggle = (otherId: string) => {
    if (subbed.has(otherId)) {
      service.unsubscribe(roadmapId, otherId);
    } else {
      service.subscribe(roadmapId, otherId);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sub-title"
        ref={dialogRef}
      >
        <h2 id="sub-title" className={styles.title}>
          Linked roadmaps
        </h2>
        <p className={styles.note}>
          Linking pulls every item from another roadmap into this one
          automatically. Different from sharing a single item — that's a
          one-at-a-time action you do from an item's Share menu.
        </p>

        <section>
          <h3 className={styles.subhead}>Pulls items from</h3>
          <p className={styles.note}>
            Items on any roadmap you check below appear here automatically.
            Read-only on this side — the source team still owns them.
          </p>
          <div className={styles.list}>
            {candidates.length === 0 && (
              <div className={styles.empty}>
                No other roadmaps to link to.
              </div>
            )}
            {candidates.map((r) => {
              const team = service.getGroup(r.groupId);
              return (
                <label key={r.id} className={styles.row}>
                  <input
                    type="checkbox"
                    checked={subbed.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={`Pull items from ${r.name}`}
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
        </section>

        <section>
          <h3 className={styles.subhead}>Linked into</h3>
          {subscribers.length === 0 ? (
            <div className={styles.empty}>
              No other roadmaps are pulling from this one.
            </div>
          ) : (
            <>
              <p className={styles.note}>
                These roadmaps automatically include every item placed here.
                Edits you make to items propagate to them.
              </p>
              <div className={styles.list}>
                {subscribers.map((r) => {
                  const team = service.getGroup(r.groupId);
                  return (
                    <Link
                      key={r.id}
                      to={`/roadmaps/${r.id}`}
                      className={styles.subscriberRow}
                      onClick={onClose}
                    >
                      <div className={styles.rowMain}>
                        <div className={styles.rowTitle}>{r.name}</div>
                        <div className={styles.rowMeta}>
                          {team?.name ?? "—"} · {r.timelineGranularity}
                        </div>
                      </div>
                      <span className={styles.openHint} aria-hidden="true">↗</span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <div className={styles.actions}>
          <button className={styles.primary} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
