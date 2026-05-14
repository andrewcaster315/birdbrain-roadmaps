import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../data/DataContext";
import { useAuth } from "../auth/AuthContext";
import { FavoriteStar } from "../components/FavoriteStar";
import type { ID, Group } from "../types";
import styles from "./HomePage.module.css";

type TreeNode = { group: Group; children: TreeNode[] };

const buildTree = (groups: Group[]): TreeNode[] => {
  const map = new Map<ID, TreeNode>();
  for (const g of groups) map.set(g.id, { group: g, children: [] });
  const roots: TreeNode[] = [];
  for (const g of groups) {
    const node = map.get(g.id)!;
    if (g.parentGroupId && map.has(g.parentGroupId)) {
      map.get(g.parentGroupId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
};

const GroupRow = ({
  node,
  depth,
  roadmapCounts,
}: {
  node: TreeNode;
  depth: number;
  roadmapCounts: Map<ID, number>;
}) => {
  return (
    <>
      <div className={styles.groupRow} style={{ paddingLeft: 12 + depth * 20 }}>
        <Link to={`/groups/${node.group.id}`} className={styles.groupName}>
          {node.group.name}
        </Link>
        <span className={styles.groupMeta}>
          {roadmapCounts.get(node.group.id) ?? 0} roadmap
          {(roadmapCounts.get(node.group.id) ?? 0) === 1 ? "" : "s"}
        </span>
      </div>
      {node.children.map((c) => (
        <GroupRow
          key={c.group.id}
          node={c}
          depth={depth + 1}
          roadmapCounts={roadmapCounts}
        />
      ))}
    </>
  );
};

export const HomePage = () => {
  const { service } = useData();
  const { currentUser } = useAuth();

  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentGroupId, setParentGroupId] = useState<ID | "">("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!showCreate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowCreate(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCreate]);

  const groups = service.listGroups();
  const allRoadmaps = service.listRoadmaps();
  const roadmapCounts = useMemo(() => {
    const m = new Map<ID, number>();
    for (const r of allRoadmaps) m.set(r.groupId, (m.get(r.groupId) ?? 0) + 1);
    return m;
  }, [allRoadmaps]);

  const favoriteIds = currentUser ? service.listFavorites(currentUser.id) : [];
  const favoriteRoadmaps = favoriteIds
    .map((id) => allRoadmaps.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => !!r);

  const tree = buildTree(groups);

  const q = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!q) return null;
    const matchingGroups = groups
      .filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.description.toLowerCase().includes(q)
      )
      .slice(0, 50);
    const matchingRoadmaps = allRoadmaps
      .filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q)
      )
      .slice(0, 50);
    return { groups: matchingGroups, roadmaps: matchingRoadmaps };
  }, [q, groups, allRoadmaps]);

  const groupCrumb = (g: Group): string => {
    const parts: string[] = [g.name];
    let cur = g.parentGroupId ? service.getGroup(g.parentGroupId) : null;
    while (cur) {
      parts.unshift(cur.name);
      cur = cur.parentGroupId ? service.getGroup(cur.parentGroupId) : null;
    }
    return parts.join(" / ");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      service.createGroup(
        {
          name,
          description,
          parentGroupId: parentGroupId === "" ? null : parentGroupId,
        },
        currentUser?.id ?? null
      );
      setName("");
      setDescription("");
      setParentGroupId("");
      setShowCreate(false);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>Home</h1>
        <button className={styles.primary} onClick={() => setShowCreate(true)}>
          New group
        </button>
      </div>

      <label className={styles.searchLabel} htmlFor="search">
        <span className={styles.searchIcon} aria-hidden="true">⌕</span>
        <input
          id="search"
          className={styles.search}
          type="search"
          placeholder="Search groups, sub-groups, and roadmaps…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search"
        />
      </label>

      {searchResults ? (
        <section aria-label="Search results">
          <h2 className={styles.section}>Search results</h2>
          {searchResults.groups.length === 0 &&
          searchResults.roadmaps.length === 0 ? (
            <div className={styles.empty}>No matches.</div>
          ) : (
            <>
              {searchResults.groups.length > 0 && (
                <div className={styles.searchSection}>
                  <div className={styles.searchSubhead}>
                    Groups ({searchResults.groups.length})
                  </div>
                  <div className={styles.searchList}>
                    {searchResults.groups.map((g) => (
                      <Link
                        key={g.id}
                        to={`/groups/${g.id}`}
                        className={styles.searchRow}
                      >
                        <div className={styles.searchRowMain}>
                          <span className={styles.searchRowTitle}>
                            {g.name}
                          </span>
                        </div>
                        <div className={styles.searchRowMeta}>
                          {groupCrumb(g)}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {searchResults.roadmaps.length > 0 && (
                <div className={styles.searchSection}>
                  <div className={styles.searchSubhead}>
                    Roadmaps ({searchResults.roadmaps.length})
                  </div>
                  <div className={styles.searchList}>
                    {searchResults.roadmaps.map((r) => {
                      const g = service.getGroup(r.groupId);
                      return (
                        <Link
                          key={r.id}
                          to={`/roadmaps/${r.id}`}
                          className={styles.searchRow}
                        >
                          <div className={styles.searchRowMain}>
                            <span className={styles.searchRowTitle}>
                              {r.name}
                            </span>
                          </div>
                          <div className={styles.searchRowMeta}>
                            {g ? groupCrumb(g) : ""}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <>
          {currentUser && favoriteRoadmaps.length > 0 && (
            <section>
              <h2 className={styles.section}>Your favorites</h2>
              <div className={styles.favGrid}>
                {favoriteRoadmaps.map((r, idx) => {
                  const g = service.getGroup(r.groupId);
                  return (
                    <div key={r.id} className={styles.favTile}>
                      <Link
                        to={`/roadmaps/${r.id}`}
                        className={styles.favTileTitle}
                      >
                        {r.name}
                      </Link>
                      <div className={styles.favTileMeta}>
                        {g ? groupCrumb(g) : ""}
                      </div>
                      <div className={styles.favTileFooter}>
                        <div className={styles.favReorder}>
                          <button
                            type="button"
                            className={styles.tinyBtn}
                            onClick={() =>
                              service.moveFavorite(currentUser.id, r.id, "up")
                            }
                            disabled={idx === 0}
                            aria-label={`Move ${r.name} up`}
                            title="Move up"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className={styles.tinyBtn}
                            onClick={() =>
                              service.moveFavorite(currentUser.id, r.id, "down")
                            }
                            disabled={idx === favoriteRoadmaps.length - 1}
                            aria-label={`Move ${r.name} down`}
                            title="Move down"
                          >
                            ▼
                          </button>
                        </div>
                        <FavoriteStar roadmapId={r.id} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {groups.length === 0 ? (
            <section className={styles.welcome}>
              <h2 className={styles.welcomeTitle}>Welcome to {service.getSettings().orgName || "Roadmaps"}.</h2>
              <p className={styles.welcomeBody}>
                You're the first one here. Start by creating a group — that's
                a team, a program, or a leadership view that owns one or more
                roadmaps. Then add a roadmap underneath, and start dropping in
                items.
              </p>
              <button
                className={styles.welcomeCta}
                onClick={() => setShowCreate(true)}
              >
                Create your first group
              </button>
              <p className={styles.welcomeHint}>
                Tip: groups can be nested — a director's group with sub-teams
                works well. You can rename anything later.
              </p>
            </section>
          ) : (
            <section>
              <h2 className={styles.section}>Groups</h2>
              <div className={styles.card}>
                {tree.map((root) => (
                  <GroupRow
                    key={root.group.id}
                    node={root}
                    depth={0}
                    roadmapCounts={roadmapCounts}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

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
            aria-labelledby="new-group-title"
          >
            <h2 id="new-group-title" className={styles.modalTitle}>
              New group
            </h2>
            <label className={styles.label}>
              Name
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Growth Product"
                autoFocus
                required
              />
            </label>
            <label className={styles.label}>
              Description (optional)
              <textarea
                className={styles.input}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="What does this group own?"
              />
            </label>
            <label className={styles.label}>
              Parent group (optional)
              <select
                className={styles.input}
                value={parentGroupId}
                onChange={(e) => setParentGroupId(e.target.value as ID)}
              >
                <option value="">— Top-level —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
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
