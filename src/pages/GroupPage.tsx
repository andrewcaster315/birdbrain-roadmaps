import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useData } from "../data/DataContext";
import { useAuth } from "../auth/AuthContext";
import { InlineEdit } from "../components/InlineEdit";
import { confirmDialog } from "../components/ConfirmDialog";
import { pushToast } from "../components/Toaster";
import styles from "./GroupPage.module.css";

export const GroupPage = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { service } = useData();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const group = groupId ? service.getGroup(groupId) : null;
  const roadmaps = groupId ? service.listRoadmaps(groupId) : [];
  const groups = service.listGroups();
  const subgroups = groups.filter((g) => g.parentGroupId === groupId);
  const parent = group?.parentGroupId ? service.getGroup(group.parentGroupId) : null;

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!showCreate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowCreate(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCreate]);

  if (!group) {
    return (
      <div className={styles.wrap}>
        <div className={styles.empty}>Group not found.</div>
        <Link to="/">← back to home</Link>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = service.createRoadmap(group.id, name, description, currentUser?.id ?? null);
      setName("");
      setDescription("");
      setShowCreate(false);
      setError(null);
      navigate(`/roadmaps/${r.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDeleteGroup = async () => {
    const ok = await confirmDialog({
      title: `Delete "${group.name}"?`,
      message:
        "Roadmaps under it stay visible until they're deleted individually.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) {
      service.deleteGroup(group.id, currentUser?.id ?? null);
      navigate("/");
    }
  };

  return (
    <div className={styles.wrap}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        {parent && (
          <>
            <span aria-hidden="true"> / </span>
            <Link to={`/groups/${parent.id}`}>{parent.name}</Link>
          </>
        )}
      </nav>

      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>
            <InlineEdit
              value={group.name}
              ariaLabel="Group name"
              variant="title"
              onCommit={(next) =>
                service.updateGroup(group.id, { name: next }, currentUser?.id ?? null)
              }
            />
          </h1>
          <div className={styles.description}>
            <InlineEdit
              value={group.description}
              ariaLabel="Group description"
              variant="subtitle"
              emptyText="Add a description"
              multiline
              onCommit={(next) =>
                service.updateGroup(
                  group.id,
                  { description: next },
                  currentUser?.id ?? null
                )
              }
            />
          </div>
          <div className={styles.parentRow}>
            <span className={styles.parentLabel}>Parent group:</span>
            <select
              className={styles.parentSelect}
              value={group.parentGroupId ?? ""}
              onChange={(e) => {
                try {
                  service.updateGroup(
                    group.id,
                    { parentGroupId: e.target.value || null },
                    currentUser?.id ?? null
                  );
                } catch (err) {
                  pushToast({ kind: "error", message: (err as Error).message });
                }
              }}
              aria-label="Parent group"
            >
              <option value="">— Top-level —</option>
              {groups
                .filter((g) => g.id !== group.id)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div className={styles.actions}>
          <button className={styles.danger} onClick={onDeleteGroup}>
            Delete
          </button>
          <button className={styles.primary} onClick={() => setShowCreate(true)}>
            New roadmap
          </button>
        </div>
      </div>

      {subgroups.length > 0 && (
        <section>
          <h2 className={styles.section}>Sub-groups</h2>
          <div className={styles.gridList}>
            {subgroups.map((s) => (
              <Link key={s.id} to={`/groups/${s.id}`} className={styles.tile}>
                <div className={styles.tileTitle}>{s.name}</div>
                {s.description && (
                  <div className={styles.tileMeta}>{s.description}</div>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className={styles.section}>Roadmaps</h2>
        {roadmaps.length === 0 ? (
          <div className={styles.empty}>No roadmaps yet for this group.</div>
        ) : (
          <div className={styles.gridList}>
            {roadmaps.map((r) => (
              <Link key={r.id} to={`/roadmaps/${r.id}`} className={styles.tile}>
                <div className={styles.tileTitle}>{r.name}</div>
                <div className={styles.tileMeta}>
                  {r.description || "No description"}
                </div>
                <div className={styles.tileMeta}>
                  Granularity: {r.timelineGranularity}
                  {r.timelineGranularity === "quarters" && ` · ${r.quarterMode}`}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {showCreate && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setShowCreate(false)}
          role="presentation"
        >
          <form
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-roadmap-title"
          >
            <h2 id="new-roadmap-title" className={styles.modalTitle}>
              New roadmap
            </h2>
            <label className={styles.label}>
              Name
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 2026 H2"
                autoFocus
              />
            </label>
            <label className={styles.label}>
              Description (optional)
              <input
                className={styles.input}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            {error && <div className={styles.error} role="alert">{error}</div>}
            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className={styles.secondary}
              >
                Cancel
              </button>
              <button type="submit" className={styles.primary}>
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
