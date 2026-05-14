import { useEffect, useMemo, useState } from "react";
import { useData } from "../data/DataContext";
import { useAuth } from "../auth/AuthContext";
import { MARKER_COLORS } from "../types";
import type { StatusDef } from "../types";
import { InlineEdit } from "../components/InlineEdit";
import { confirmDialog } from "../components/ConfirmDialog";
import { pushToast } from "../components/Toaster";
import styles from "./AdminPage.module.css";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const AdminPage = () => {
  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Admin</h1>
      <p className={styles.note}>
        Settings that apply to everyone in your organization.
      </p>

      <OrgNameCard />
      <FiscalYearCard />
      <DomainsCard />
      <StatusCard />
      <DataCard />
      <ActivityCard />
      <UsersCard />
    </div>
  );
};

const OrgNameCard = () => {
  const { service } = useData();
  const { currentUser } = useAuth();
  const settings = service.getSettings();
  const [name, setName] = useState(settings.orgName);
  const [saved, setSaved] = useState(false);

  useEffect(() => setName(settings.orgName), [settings.orgName]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    service.updateSettings({ orgName: name }, currentUser?.id ?? null);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <form className={styles.card} onSubmit={submit} aria-labelledby="org-heading">
      <h2 id="org-heading" className={styles.cardTitle}>Organization name</h2>
      <p className={styles.cardNote}>
        Shown in the header and on the sign-in screen.
      </p>
      <input
        className={styles.input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your Company Name"
      />
      <div className={styles.actions}>
        {saved && <span className={styles.saved} role="status">Saved.</span>}
        <button type="submit" className={styles.primary}>Save</button>
      </div>
    </form>
  );
};

const FiscalYearCard = () => {
  const { service } = useData();
  const { currentUser } = useAuth();
  const settings = service.getSettings();
  const [month, setMonth] = useState(settings.fiscalYearStartMonth);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMonth(settings.fiscalYearStartMonth), [settings.fiscalYearStartMonth]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      service.updateSettings({ fiscalYearStartMonth: month }, currentUser?.id ?? null);
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form className={styles.card} onSubmit={submit} aria-labelledby="fy-heading">
      <h2 id="fy-heading" className={styles.cardTitle}>Fiscal year</h2>
      <p className={styles.cardNote}>
        Roadmaps set to <strong>Quarters (FY)</strong> use this start month.
      </p>
      <label className={styles.label} htmlFor="fy-start">Fiscal year starts in</label>
      <select
        id="fy-start"
        className={styles.input}
        value={month}
        onChange={(e) => setMonth(Number(e.target.value))}
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>{m}</option>
        ))}
      </select>
      <div className={styles.actions}>
        {saved && <span className={styles.saved} role="status">Saved.</span>}
        {error && <div className={styles.error} role="alert">{error}</div>}
        <button type="submit" className={styles.primary}>Save</button>
      </div>
    </form>
  );
};

const DomainsCard = () => {
  const { service } = useData();
  const { currentUser } = useAuth();
  const settings = service.getSettings();
  const [domains, setDomains] = useState(settings.allowedEmailDomains.join(", "));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => setDomains(settings.allowedEmailDomains.join(", ")),
    [settings.allowedEmailDomains]
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      service.updateSettings(
        {
          allowedEmailDomains: domains
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
        },
        currentUser?.id ?? null
      );
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form className={styles.card} onSubmit={submit} aria-labelledby="domains-heading">
      <h2 id="domains-heading" className={styles.cardTitle}>Allowed email domains</h2>
      <p className={styles.cardNote}>
        Comma-separated. Only addresses on these domains can sign in. Leave
        empty to allow any address (not recommended for production).
      </p>
      <input
        className={styles.input}
        value={domains}
        onChange={(e) => setDomains(e.target.value)}
        placeholder="yourcompany.com, sub.yourcompany.com"
      />
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.actions}>
        {saved && <span className={styles.saved} role="status">Saved.</span>}
        <button type="submit" className={styles.primary}>Save</button>
      </div>
    </form>
  );
};

const StatusCard = () => {
  const { service } = useData();
  const { currentUser } = useAuth();
  const statuses = service.listStatuses();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(MARKER_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  const onAdd = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      service.createStatus({ name, color }, currentUser?.id ?? null);
      setName("");
      setColor(MARKER_COLORS[0]);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDelete = async (s: StatusDef) => {
    const ok = await confirmDialog({
      title: `Delete status "${s.name}"?`,
      message: "Items with this status will be reassigned.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) {
      try {
        service.deleteStatus(s.id, currentUser?.id ?? null);
      } catch (err) {
        pushToast({ kind: "error", message: (err as Error).message });
      }
    }
  };

  const move = (idx: number, direction: "up" | "down") => {
    const a = statuses[idx];
    const b = statuses[direction === "up" ? idx - 1 : idx + 1];
    if (!a || !b) return;
    service.updateStatus(a.id, { position: b.position }, currentUser?.id ?? null);
    service.updateStatus(b.id, { position: a.position }, currentUser?.id ?? null);
  };

  return (
    <div className={styles.card} aria-labelledby="status-heading">
      <h2 id="status-heading" className={styles.cardTitle}>Statuses</h2>
      <p className={styles.cardNote}>
        Customize the statuses items can have. Renaming a status updates every
        item using it. Deleting a status reassigns its items to another status.
      </p>
      <div className={styles.statusList}>
        {statuses.map((s, idx) => (
          <div key={s.id} className={styles.statusRow}>
            <span className={styles.statusSwatch} style={{ background: s.color }} aria-hidden="true" />
            <div className={styles.statusMain}>
              <InlineEdit
                value={s.name}
                ariaLabel={`Status "${s.name}" name`}
                onCommit={(next) =>
                  service.updateStatus(s.id, { name: next }, currentUser?.id ?? null)
                }
              />
            </div>
            <input
              type="color"
              className={styles.colorInput}
              value={s.color}
              onChange={(e) =>
                service.updateStatus(s.id, { color: e.target.value }, currentUser?.id ?? null)
              }
              aria-label={`Status "${s.name}" color`}
              title="Change color"
            />
            <button
              className={styles.tinyBtn}
              onClick={() => move(idx, "up")}
              disabled={idx === 0}
              aria-label="Move up"
              title="Move up"
            >▲</button>
            <button
              className={styles.tinyBtn}
              onClick={() => move(idx, "down")}
              disabled={idx === statuses.length - 1}
              aria-label="Move down"
              title="Move down"
            >▼</button>
            <button
              className={styles.danger}
              onClick={() => onDelete(s)}
              aria-label={`Delete status ${s.name}`}
              disabled={statuses.length <= 1}
            >Delete</button>
          </div>
        ))}
      </div>
      <form className={styles.statusAdd} onSubmit={onAdd}>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New status name"
        />
        <input
          type="color"
          className={styles.colorInput}
          value={color}
          onChange={(e) => setColor(e.target.value)}
          aria-label="New status color"
        />
        <button type="submit" className={styles.primary}>Add</button>
      </form>
      {error && <div className={styles.error} role="alert">{error}</div>}
    </div>
  );
};

const DataCard = () => {
  const { service } = useData();
  const onExport = () => {
    const json = service.exportSnapshot();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `roadmaps-export-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.card} aria-labelledby="data-heading">
      <h2 id="data-heading" className={styles.cardTitle}>Data export</h2>
      <p className={styles.cardNote}>
        Download a complete snapshot of every group, roadmap, item, swimlane,
        marker, audit entry, and user record as JSON. Run this regularly as a
        belt-and-suspenders backup against accidental data loss.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onExport}>
          Download JSON snapshot
        </button>
      </div>
      <p className={styles.cardFootnote}>
        Production: enable Supabase point-in-time recovery (Pro plan) and
        schedule weekly off-platform backups via a Supabase scheduled
        function. The export here is a manual safety net, not a substitute.
      </p>
    </div>
  );
};

const ActivityCard = () => {
  const { service } = useData();
  const [query, setQuery] = useState("");
  const recent = service.listRecentAudit(200);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? recent.filter(
        (e) =>
          e.summary.toLowerCase().includes(q) ||
          e.entity.toLowerCase().includes(q) ||
          e.action.toLowerCase().includes(q)
      )
    : recent;

  return (
    <div className={styles.card} aria-labelledby="activity-heading">
      <div className={styles.userHeader}>
        <h2 id="activity-heading" className={styles.cardTitle}>
          Recent activity ({recent.length})
        </h2>
        <label className={styles.userSearchLabel} htmlFor="activity-search">
          <span className={styles.userSearchIcon} aria-hidden="true">⌕</span>
          <input
            id="activity-search"
            type="search"
            className={styles.userSearch}
            placeholder="Search activity…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search activity"
          />
        </label>
      </div>
      <p className={styles.cardNote}>
        Every create, update, and delete across the org. Useful for "who
        changed what" questions and weekly review.
      </p>
      {recent.length === 0 ? (
        <div className={styles.empty}>No activity yet.</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>No matches for "{query}".</div>
      ) : (
        <div className={styles.userListScroll}>
          <div className={styles.statusList}>
            {filtered.map((e) => {
              const actor = e.actorId ? service.getUser(e.actorId) : null;
              return (
                <div key={e.id} className={styles.activityRow}>
                  <span className={styles.activityKind}>{e.entity}</span>
                  <span className={styles.activityWhat}>{e.summary}</span>
                  <span className={styles.activityActor}>
                    {actor?.displayName ?? "—"}
                  </span>
                  <span className={styles.activityWhen}>
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const UsersCard = () => {
  const { service } = useData();
  const { currentUser } = useAuth();
  const [query, setQuery] = useState("");

  const users = service.listUsers();
  const sorted = useMemo(
    () =>
      users
        .slice()
        .sort(
          (a, b) =>
            a.displayName.localeCompare(b.displayName) ||
            a.email.localeCompare(b.email)
        ),
    [users]
  );
  const q = query.trim().toLowerCase();
  const filtered = q
    ? sorted.filter(
        (u) =>
          u.displayName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
      )
    : sorted;

  return (
    <div className={styles.card} aria-labelledby="users-heading">
      <div className={styles.userHeader}>
        <h2 id="users-heading" className={styles.cardTitle}>
          People with access ({sorted.length})
        </h2>
        <label className={styles.userSearchLabel} htmlFor="user-search">
          <span className={styles.userSearchIcon} aria-hidden="true">⌕</span>
          <input
            id="user-search"
            type="search"
            className={styles.userSearch}
            placeholder="Search name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search users"
          />
        </label>
      </div>
      <p className={styles.cardNote}>
        Anyone with an email on the allowed-domains list automatically gets a
        record here on first sign-in. Click a name to edit it. To revoke
        access, remove their domain from the allowed-domains list above.
      </p>
      {sorted.length === 0 ? (
        <div className={styles.empty}>No users yet.</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>No matches for "{query}".</div>
      ) : (
        <div className={styles.userListScroll}>
          <div className={styles.userList}>
            {filtered.map((u) => (
              <div key={u.id} className={styles.userRow}>
                <div className={styles.userAvatar} aria-hidden="true">
                  {u.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className={styles.userMain}>
                  <div className={styles.userName}>
                    <InlineEdit
                      value={u.displayName}
                      ariaLabel={`Display name for ${u.email}`}
                      onCommit={(next) =>
                        service.updateUser(
                          u.id,
                          { displayName: next },
                          currentUser?.id ?? null
                        )
                      }
                    />
                    {u.id === currentUser?.id && (
                      <span className={styles.youTag}>you</span>
                    )}
                  </div>
                  <div className={styles.userMeta}>{u.email}</div>
                </div>
                <div className={styles.userJoined}>
                  Joined{" "}
                  {new Date(u.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {q && filtered.length > 0 && (
        <div className={styles.userResultsCount}>
          Showing {filtered.length} of {sorted.length}
        </div>
      )}
    </div>
  );
};
