import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useData } from "../data/DataContext";
import { useAuth } from "../auth/AuthContext";
import type { Item, Roadmap, Swimlane } from "../types";
import { UserPicker } from "./UserPicker";
import { formatDate } from "../utils/dates";
import { useFocusTrap } from "../utils/useFocusTrap";
import { confirmDialog } from "./ConfirmDialog";
import styles from "./ItemEditor.module.css";

type Props = {
  item: Item | null; // null = creating new
  roadmap: Roadmap; // the roadmap currently being viewed
  swimlanes: Swimlane[]; // swimlanes on the *currently viewed* roadmap
  onClose: () => void;
};

export const ItemEditor = ({ item, roadmap, swimlanes, onClose }: Props) => {
  const { service } = useData();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const isNew = item === null;
  const homeRoadmap = item ? service.getRoadmap(item.homeRoadmapId) : null;

  // Read-only when we're not on the item's home roadmap. Item owners only see
  // editing controls from the source roadmap.
  const readonly = !isNew && item !== null && item.homeRoadmapId !== roadmap.id;

  // For subscription-arrived items, the swimlane belongs to the *current*
  // roadmap (via subscribedItemLanePrefs), not the home roadmap. So this is
  // independently editable even when the rest of the editor is read-only.
  const initialSwimlaneId = item
    ? service.getItemSwimlane(item.id, roadmap.id)
    : null;

  const statuses = service.listStatuses();
  const defaultStatus = statuses[0]?.name ?? "Planned";

  const [title, setTitle] = useState(item?.title ?? "");
  const [status, setStatus] = useState<string>(item?.status ?? defaultStatus);
  const [ownerId, setOwnerId] = useState<string | null>(item?.ownerId ?? null);
  const [ownerText, setOwnerText] = useState(item?.ownerText ?? "");
  const [startDate, setStartDate] = useState(item?.startDate ?? "");
  const [endDate, setEndDate] = useState(item?.endDate ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [swimlaneId, setSwimlaneId] = useState<string | "">(
    initialSwimlaneId ?? ""
  );
  const [dependsOn, setDependsOn] = useState<string[]>(
    item?.dependsOnItemIds ?? []
  );
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLFormElement | null>(null);

  useFocusTrap(dialogRef, { onEscape: onClose });

  const allItems = useMemo(
    () => service.listItems().filter((i) => i.id !== item?.id),
    [item?.id, service]
  );

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (readonly) {
      // Only the swimlane assignment may have changed — that's allowed.
      if (item) {
        try {
          service.setItemSwimlane(item.id, roadmap.id, swimlaneId || null);
        } catch (err) {
          setError((err as Error).message);
          return;
        }
      }
      onClose();
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setError("Start date must be on or before end date.");
      return;
    }
    try {
      const fields = {
        title: title.trim(),
        status,
        ownerId,
        ownerText: ownerText.trim(),
        startDate: startDate || null,
        endDate: endDate || null,
        notes,
        dependsOnItemIds: dependsOn,
      };
      if (isNew) {
        const created = service.createItem(roadmap.id, fields, currentUser?.id ?? null);
        if (swimlaneId) {
          service.setItemSwimlane(created.id, roadmap.id, swimlaneId);
        }
      } else if (item) {
        service.updateItem(item.id, fields, currentUser?.id ?? null);
        service.setItemSwimlane(item.id, roadmap.id, swimlaneId || null);
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDelete = async () => {
    if (!item) return;
    const ok = await confirmDialog({
      title: `Delete "${item.title}"?`,
      message:
        "It will disappear from every roadmap it's on. You can restore it from Trash within 30 days.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) {
      service.deleteItem(item.id, currentUser?.id ?? null);
      onClose();
    }
  };

  const goToHome = () => {
    if (homeRoadmap) {
      onClose();
      navigate(`/roadmaps/${homeRoadmap.id}`);
    }
  };

  const auditEntries = item ? service.listAuditFor("item", item.id) : [];
  const dependencyItems = dependsOn
    .map((id) => service.getItem(id))
    .filter((x): x is NonNullable<typeof x> => !!x && x.deletedAt === null);

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <form
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSave}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-editor-title"
      >
        <div className={styles.head}>
          <h2 id="item-editor-title" className={styles.title}>
            {isNew ? "New item" : readonly ? "View item" : "Edit item"}
          </h2>
          {readonly && homeRoadmap && (
            <div className={styles.readonlyBanner} role="status">
              <strong>Read-only.</strong> This item lives on{" "}
              <strong>{homeRoadmap.name}</strong>. Open it there to edit.
              <button
                type="button"
                className={styles.bannerLink}
                onClick={goToHome}
              >
                Open source roadmap →
              </button>
            </div>
          )}
          {!isNew && !readonly && homeRoadmap && (
            <div className={styles.note}>
              Home roadmap: <strong>{homeRoadmap.name}</strong> — editing here
              updates everywhere
            </div>
          )}
        </div>

        <label className={styles.label}>
          Title
          <input
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is this project?"
            autoFocus={!readonly}
            required
            disabled={readonly}
          />
        </label>

        <div className={styles.row}>
          <label className={styles.label} style={{ flex: 1 }}>
            Status
            <select
              className={styles.input}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={readonly}
            >
              {statuses.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label} style={{ flex: 1 }}>
            Swimlane (on this roadmap)
            <select
              className={styles.input}
              value={swimlaneId}
              onChange={(e) => setSwimlaneId(e.target.value)}
            >
              <option value="">— Unassigned —</option>
              {swimlanes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className={styles.fieldset} disabled={readonly}>
          <legend className={styles.legend}>Owner</legend>
          <UserPicker
            ownerId={ownerId}
            ownerText={ownerText}
            onChangeOwnerId={setOwnerId}
            onChangeOwnerText={setOwnerText}
          />
        </fieldset>

        <div className={styles.row}>
          <label className={styles.label} style={{ flex: 1 }}>
            Start date
            <input
              className={styles.input}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={readonly}
            />
          </label>
          <label className={styles.label} style={{ flex: 1 }}>
            End date
            <input
              className={styles.input}
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={readonly}
            />
          </label>
        </div>

        <DependsOnPicker
          allItems={allItems}
          value={dependsOn}
          onChange={setDependsOn}
          disabled={readonly}
        />

        {dependencyItems.length > 0 && (
          <div className={styles.depList}>
            <span className={styles.depLabel}>Depends on:</span>
            {dependencyItems.map((d) => (
              <button
                key={d.id}
                type="button"
                className={styles.depChip}
                onClick={() => {
                  onClose();
                  navigate(`/roadmaps/${d.homeRoadmapId}`);
                }}
                title={`Open ${d.title}`}
              >
                {d.title}
              </button>
            ))}
          </div>
        )}

        <label className={styles.label}>
          Notes
          <textarea
            className={styles.textarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional"
            disabled={readonly}
          />
        </label>

        {!isNew && auditEntries.length > 0 && (
          <details className={styles.activity}>
            <summary>Activity ({auditEntries.length})</summary>
            <div className={styles.activityList}>
              {auditEntries.map((e) => {
                const actor = e.actorId ? service.getUser(e.actorId) : null;
                return (
                  <div key={e.id} className={styles.activityRow}>
                    <span className={styles.activityWho}>
                      {actor?.displayName ?? "—"}
                    </span>
                    <span className={styles.activityWhat}>{e.summary}</span>
                    <span className={styles.activityWhen}>
                      {new Date(e.createdAt).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {error && <div className={styles.error} role="alert">{error}</div>}

        <div className={styles.actions}>
          {!isNew && !readonly && (
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={onDelete}
            >
              Delete item
            </button>
          )}
          <span className={styles.spacer} />
          <button type="button" className={styles.secondary} onClick={onClose}>
            {readonly ? "Close" : "Cancel"}
          </button>
          <button type="submit" className={styles.primary}>
            {isNew ? "Create" : readonly ? "Save lane only" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
};

const DependsOnPicker = ({
  allItems,
  value,
  onChange,
  disabled,
}: {
  allItems: Item[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);
  return (
    <div className={styles.label}>
      <span>Depends on (optional)</span>
      <details
        className={styles.depPicker}
        open={open}
        onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className={styles.depSummary}>
          {value.length === 0
            ? disabled
              ? "—"
              : "Add a dependency"
            : `${value.length} item${value.length === 1 ? "" : "s"}`}
        </summary>
        <div className={styles.depDropdown}>
          {allItems.length === 0 && (
            <div className={styles.depEmpty}>No other items to depend on.</div>
          )}
          {allItems.map((it) => (
            <label key={it.id} className={styles.depRow}>
              <input
                type="checkbox"
                checked={selected.has(it.id)}
                disabled={disabled}
                onChange={(e) => {
                  if (e.target.checked) onChange([...value, it.id]);
                  else onChange(value.filter((x) => x !== it.id));
                }}
              />
              <span>{it.title}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
};
