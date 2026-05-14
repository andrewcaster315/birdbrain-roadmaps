// Template legal pages. The content here is a placeholder for your legal team
// to review and fill in before launch. Don't ship as-is.

import styles from "./LegalPages.module.css";

const TODO = ({ children }: { children: React.ReactNode }) => (
  <span className={styles.todo}>[ TODO — {children} ]</span>
);

export const LegalPrivacyPage = () => (
  <div className={styles.wrap}>
    <h1 className={styles.title}>Privacy Policy</h1>
    <div className={styles.placeholder}>
      Template content for your legal team to review and replace before launch.
      Last updated: <TODO>fill in</TODO>.
    </div>

    <h2 className={styles.section}>What we collect</h2>
    <p>
      Your work email address (for sign-in), the display name we derive from it
      (which you can edit), and the data you create inside the tool — groups,
      roadmaps, items, comments, and dates. We track when you sign in and when
      you change things in the tool's audit log.
    </p>

    <h2 className={styles.section}>How we use it</h2>
    <p>
      To run the product. We do not sell or share your data with third parties.
      Aggregate, anonymized usage may be reviewed by the platform operator
      (<TODO>your company / department</TODO>) to improve the tool.
    </p>

    <h2 className={styles.section}>Where it lives</h2>
    <p>
      Data is hosted by <TODO>Supabase or other provider name</TODO> in
      <TODO>region</TODO>. Connections are encrypted in transit (HTTPS) and at
      rest. Backups are taken <TODO>frequency</TODO> and retained for{" "}
      <TODO>retention period</TODO>.
    </p>

    <h2 className={styles.section}>Your rights</h2>
    <p>
      You may request a copy of your data, request corrections, or request that
      your account be deleted by contacting <TODO>privacy@yourcompany.com</TODO>.
    </p>

    <h2 className={styles.section}>Cookies and tracking</h2>
    <p>
      We use a single first-party cookie / localStorage entry to keep you
      signed in. We do not use third-party analytics or advertising trackers.
    </p>

    <h2 className={styles.section}>Contact</h2>
    <p>
      Questions about this policy: <TODO>privacy@yourcompany.com</TODO>.
    </p>
  </div>
);

export const LegalTermsPage = () => (
  <div className={styles.wrap}>
    <h1 className={styles.title}>Terms of Use</h1>
    <div className={styles.placeholder}>
      Template content for your legal team to review and replace before launch.
      Last updated: <TODO>fill in</TODO>.
    </div>

    <h2 className={styles.section}>Acceptable use</h2>
    <p>
      Birdbrain Roadmaps is provided to <TODO>your company</TODO> employees
      and contractors. By signing in you agree to use the product only for
      legitimate work purposes and to protect any confidential information
      you encounter here.
    </p>

    <h2 className={styles.section}>Confidentiality</h2>
    <p>
      Roadmap data is confidential. Do not export, share, or discuss
      its contents outside the company. Sharing screenshots externally requires
      explicit approval from <TODO>your manager / leadership / etc.</TODO>.
    </p>

    <h2 className={styles.section}>No warranty</h2>
    <p>
      The tool is provided as-is. Data integrity is best-effort but not
      guaranteed; export important roadmaps periodically as backup. The
      platform operator may take it down for maintenance or end-of-life with
      reasonable notice.
    </p>

    <h2 className={styles.section}>Termination</h2>
    <p>
      Access ends when your employment with <TODO>Your Company</TODO> ends, or
      when an admin removes your email's domain from the allowed-domains list.
      Your contributions remain in the tool's history under your name.
    </p>

    <h2 className={styles.section}>Contact</h2>
    <p>
      Questions about these terms: <TODO>legal@yourcompany.com</TODO>.
    </p>
  </div>
);
