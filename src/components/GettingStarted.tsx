// Dismissible "Getting started" tip card. Renders on the homepage when:
//   (a) the viewer hasn't dismissed it yet, AND
//   (b) the viewer has no favorited roadmaps yet
// The favorites check is a soft proxy for "this person hasn't really used
// the app yet" so the card disappears once they're up and running, even
// without an explicit dismiss.

import { useEffect, useState } from "react";
import styles from "./GettingStarted.module.css";

const STORAGE_KEY = "birdbrain/gettingStarted/dismissed/v1";

type Props = {
  hasFavorites: boolean;
};

export const GettingStarted = ({ hasFavorites }: Props) => {
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Storage disabled (e.g. iOS Safari private mode). Treat as "not
      // dismissed yet" — the card will keep appearing each session, which
      // is acceptable.
    }
  }, []);

  if (dismissed || hasFavorites) return null;

  const onDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Best-effort; in-memory state below still hides the card for this
      // session even if persistence fails.
    }
    setDismissed(true);
  };

  return (
    <section className={styles.card} aria-label="Getting started">
      <div className={styles.head}>
        <h2 className={styles.title}>Getting started</h2>
        <button
          type="button"
          className={styles.dismiss}
          onClick={onDismiss}
          aria-label="Dismiss getting started tips"
          title="Dismiss"
        >
          ×
        </button>
      </div>

      <ol className={styles.steps}>
        <li>
          <span className={styles.stepN} aria-hidden="true">1</span>
          <div>
            <strong>Groups hold roadmaps.</strong> A group is usually a team
            (e.g. "Growth Product") or a program (e.g. "Onboarding Overhaul").
            Open a group to see its roadmaps, or create your own.
          </div>
        </li>
        <li>
          <span className={styles.stepN} aria-hidden="true">2</span>
          <div>
            <strong>Roadmaps hold items.</strong> Items have a title, owner,
            status, dates, and a priority. Drag bars on the timeline to move
            or resize, or edit any field inline in the table below.
          </div>
        </li>
        <li>
          <span className={styles.stepN} aria-hidden="true">3</span>
          <div>
            <strong>Subscribe to peer roadmaps.</strong> Director-level views
            work by subscribing — items from other teams appear on yours
            automatically. You can re-order shared items locally without
            affecting the source team.
          </div>
        </li>
        <li>
          <span className={styles.stepN} aria-hidden="true">4</span>
          <div>
            <strong>Star roadmaps you care about.</strong> Favorites show up
            at the top of this page for quick access. This card disappears
            once you've starred your first one.
          </div>
        </li>
      </ol>

      <p className={styles.footer}>
        Got a bug or a suggestion? Email{" "}
        <a href="mailto:support@birdbrain.tools">support@birdbrain.tools</a>.
      </p>
    </section>
  );
};
