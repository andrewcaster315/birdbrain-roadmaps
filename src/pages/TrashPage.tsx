import { useData } from "../data/DataContext";
import { useAuth } from "../auth/AuthContext";
import { formatDate } from "../utils/dates";
import styles from "./TrashPage.module.css";

const daysAgo = (iso: string): number => {
  const d = new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24)));
};

export const TrashPage = () => {
  const { service } = useData();
  const { currentUser } = useAuth();
  const items = service.trashedItems();
  const roadmaps = service.trashedRoadmaps();
  const groups = service.trashedGroups();

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Trash</h1>
      <p className={styles.note}>
        Deleted items, roadmaps, and groups stay here for 30 days, then
        auto-purge.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Items ({items.length})</h2>
        {items.length === 0 ? (
          <div className={styles.empty}>No deleted items.</div>
        ) : (
          <div className={styles.list}>
            {items.map((it) => {
              const age = daysAgo(it.deletedAt!);
              const remaining = Math.max(0, 30 - age);
              return (
                <div key={it.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{it.title}</div>
                    <div className={styles.rowMeta}>
                      Deleted {formatDate(it.deletedAt!.slice(0, 10))} · purges in {remaining}d
                    </div>
                  </div>
                  <button
                    className={styles.restore}
                    onClick={() => service.restoreItem(it.id, currentUser?.id ?? null)}
                  >
                    Restore
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Roadmaps ({roadmaps.length})</h2>
        {roadmaps.length === 0 ? (
          <div className={styles.empty}>No deleted roadmaps.</div>
        ) : (
          <div className={styles.list}>
            {roadmaps.map((r) => (
              <div key={r.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>{r.name}</div>
                  <div className={styles.rowMeta}>
                    Deleted {formatDate(r.deletedAt!.slice(0, 10))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Groups ({groups.length})</h2>
        {groups.length === 0 ? (
          <div className={styles.empty}>No deleted groups.</div>
        ) : (
          <div className={styles.list}>
            {groups.map((g) => (
              <div key={g.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>{g.name}</div>
                  <div className={styles.rowMeta}>
                    Deleted {formatDate(g.deletedAt!.slice(0, 10))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
