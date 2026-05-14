import { useRef, useState } from "react";
import { useData } from "../data/DataContext";
import { useAuth } from "../auth/AuthContext";
import { InlineEdit } from "./InlineEdit";
import { useFocusTrap } from "../utils/useFocusTrap";
import { confirmDialog } from "./ConfirmDialog";
import styles from "./SwimlaneManager.module.css";

type Props = {
  roadmapId: string;
  onClose: () => void;
};

export const SwimlaneManager = ({ roadmapId, onClose }: Props) => {
  const { service } = useData();
  const { currentUser } = useAuth();
  const swimlanes = service.listSwimlanes(roadmapId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, { onEscape: onClose });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      service.createSwimlane(
        roadmapId,
        name,
        description,
        currentUser?.id ?? null
      );
      setName("");
      setDescription("");
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDelete = async (id: string, laneName: string) => {
    const ok = await confirmDialog({
      title: `Delete swimlane "${laneName}"?`,
      message: "Items in this lane will move to Unassigned.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) {
      service.deleteSwimlane(id, currentUser?.id ?? null);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="swimlane-title"
        ref={dialogRef}
      >
        <h2 id="swimlane-title" className={styles.title}>
          Swimlanes
        </h2>
        <p className={styles.note}>
          Group items on this roadmap into swimlanes. Each lane has a name and
          an optional description.
        </p>

        {swimlanes.length === 0 ? (
          <div className={styles.empty}>No swimlanes yet.</div>
        ) : (
          <div className={styles.list}>
            {swimlanes.map((s, idx) => {
              const move = (direction: "up" | "down") => {
                const a = swimlanes[idx];
                const b = swimlanes[direction === "up" ? idx - 1 : idx + 1];
                if (!a || !b) return;
                service.updateSwimlane(
                  a.id,
                  { position: b.position },
                  currentUser?.id ?? null
                );
                service.updateSwimlane(
                  b.id,
                  { position: a.position },
                  currentUser?.id ?? null
                );
              };
              return (
                <div key={s.id} className={styles.row}>
                  <div className={styles.reorder}>
                    <button
                      type="button"
                      className={styles.tinyBtn}
                      onClick={() => move("up")}
                      disabled={idx === 0}
                      aria-label={`Move ${s.name} up`}
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className={styles.tinyBtn}
                      onClick={() => move("down")}
                      disabled={idx === swimlanes.length - 1}
                      aria-label={`Move ${s.name} down`}
                      title="Move down"
                    >
                      ▼
                    </button>
                  </div>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>
                      <InlineEdit
                        value={s.name}
                        ariaLabel={`Swimlane "${s.name}" name`}
                        onCommit={(next) =>
                          service.updateSwimlane(
                            s.id,
                            { name: next },
                            currentUser?.id ?? null
                          )
                        }
                      />
                    </div>
                    <div className={styles.rowMeta}>
                      <InlineEdit
                        value={s.description}
                        ariaLabel={`Swimlane "${s.name}" description`}
                        emptyText="Add a description"
                        variant="subtitle"
                        onCommit={(next) =>
                          service.updateSwimlane(
                            s.id,
                            { description: next },
                            currentUser?.id ?? null
                          )
                        }
                      />
                    </div>
                  </div>
                  <button
                    className={styles.danger}
                    onClick={() => onDelete(s.id, s.name)}
                    aria-label={`Delete swimlane ${s.name}`}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <form className={styles.addForm} onSubmit={submit}>
          <h3 className={styles.subhead}>Add swimlane</h3>
          <label className={styles.label}>
            Name
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acquisition"
            />
          </label>
          <label className={styles.label}>
            Description (optional)
            <input
              className={styles.input}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What goes in this lane?"
            />
          </label>
          {error && <div className={styles.error} role="alert">{error}</div>}
          <div className={styles.formActions}>
            <button type="submit" className={styles.primary}>
              Add lane
            </button>
          </div>
        </form>

        <div className={styles.actions}>
          <button className={styles.primary} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
