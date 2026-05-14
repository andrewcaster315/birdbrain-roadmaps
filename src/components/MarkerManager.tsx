import { useRef, useState } from "react";
import { useData } from "../data/DataContext";
import { useAuth } from "../auth/AuthContext";
import { MARKER_COLORS } from "../types";
import type { Marker } from "../types";
import { todayISO, formatDate } from "../utils/dates";
import { useFocusTrap } from "../utils/useFocusTrap";
import { confirmDialog } from "./ConfirmDialog";
import styles from "./MarkerManager.module.css";

type Props = {
  roadmapId: string;
  onClose: () => void;
};

export const MarkerManager = ({ roadmapId, onClose }: Props) => {
  const { service } = useData();
  const { currentUser } = useAuth();
  const markers = service.listMarkers(roadmapId);

  const [date, setDate] = useState(todayISO());
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<string>(MARKER_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, { onEscape: onClose });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      service.createMarker(
        roadmapId,
        { date, label, color },
        currentUser?.id ?? null
      );
      setDate(todayISO());
      setLabel("");
      setColor(MARKER_COLORS[0]);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDelete = async (m: Marker) => {
    const ok = await confirmDialog({
      title: `Delete marker "${m.label || formatDate(m.date)}"?`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) {
      service.deleteMarker(m.id, currentUser?.id ?? null);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="marker-title"
        ref={dialogRef}
      >
        <h2 id="marker-title" className={styles.title}>
          Important dates
        </h2>
        <p className={styles.note}>
          Labeled vertical lines for things like go-live, deadlines, and
          reviews. They render across every swimlane on this roadmap.
        </p>

        {markers.length === 0 ? (
          <div className={styles.empty}>No dates yet.</div>
        ) : (
          <div className={styles.list}>
            {markers.map((m) => (
              <div key={m.id} className={styles.row}>
                <span
                  className={styles.swatch}
                  style={{ background: m.color }}
                  aria-hidden="true"
                />
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>
                    {m.label || <em className={styles.placeholder}>Untitled</em>}
                  </div>
                  <div className={styles.rowMeta}>{formatDate(m.date)}</div>
                </div>
                <button
                  className={styles.danger}
                  onClick={() => onDelete(m)}
                  aria-label={`Delete marker ${m.label || formatDate(m.date)}`}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <form className={styles.addForm} onSubmit={submit}>
          <h3 className={styles.subhead}>Add date</h3>
          <div className={styles.formGrid}>
            <label className={styles.label}>
              Date
              <input
                className={styles.input}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label className={styles.label} style={{ flex: 2 }}>
              Label (optional)
              <input
                className={styles.input}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder='e.g. "Beta launch"'
              />
            </label>
          </div>
          <div className={styles.colorPickerRow}>
            <span className={styles.colorLabel}>Color</span>
            <div
              className={styles.colorPalette}
              role="radiogroup"
              aria-label="Marker color"
            >
              {MARKER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.colorSwatch} ${
                    color === c ? styles.colorActive : ""
                  }`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  role="radio"
                  aria-checked={color === c}
                  aria-label={`Color ${c}`}
                  title={c}
                />
              ))}
              <input
                type="color"
                className={styles.colorCustom}
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Custom color"
                title="Custom color"
              />
            </div>
          </div>
          {error && <div className={styles.error} role="alert">{error}</div>}
          <div className={styles.formActions}>
            <button type="submit" className={styles.primary}>
              Add date
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
