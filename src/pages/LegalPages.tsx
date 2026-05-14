// Privacy Policy and Terms of Use for birdbrain.tools.
// These pages describe the hosted service. The MIT-licensed source code is
// governed separately by the LICENSE file in the repository root.

import styles from "./LegalPages.module.css";

const LAST_UPDATED = "May 14, 2026";

export const LegalPrivacyPage = () => (
  <div className={styles.wrap}>
    <h1 className={styles.title}>Privacy Policy</h1>
    <p className={styles.lastUpdated}>
      <em>Last updated: {LAST_UPDATED}</em>
    </p>

    <p>
      Birdbrain Roadmaps is a free, open-source roadmapping tool offered as a
      personal side project. This page explains what information is collected
      when you use the hosted version at <strong>birdbrain.tools</strong>, how
      it is used, and how to remove it. The source code is available at{" "}
      <a
        href="https://github.com/andrewcaster315/birdbrain-roadmaps"
        target="_blank"
        rel="noreferrer"
      >
        github.com/andrewcaster315/birdbrain-roadmaps
      </a>{" "}
      under the MIT License.
    </p>

    <h2 className={styles.section}>Who runs this service</h2>
    <p>
      Birdbrain Roadmaps is maintained by a single individual operating
      birdbrain.tools as a personal open-source project. It is not a registered
      business and is not affiliated with any employer or organization. If you
      self-host the code under the MIT License, you operate your own instance
      and this Privacy Policy does not govern it.
    </p>

    <h2 className={styles.section}>Scope and audience</h2>
    <p>
      Birdbrain Roadmaps is currently a single-tenant service. Access to the
      hosted instance at birdbrain.tools is restricted to email addresses on
      the <strong>nyulangone.org</strong> domain, the maintainer's own
      account, and any future co-maintainers. NYU Langone Health is the only
      organization currently using this hosted instance.
    </p>
    <p>
      The service may, in the future, be expanded to a multi-tenant
      architecture. In that event, every tenant's data would remain strictly
      isolated from every other tenant's data, and this Privacy Policy would
      be updated to reflect the new model.
    </p>

    <h2 className={styles.section}>What we collect</h2>
    <p>
      <strong>When you sign in:</strong> your email address (used as your
      account identifier and to deliver sign-in links) and a display name you
      can edit.
    </p>
    <p>
      <strong>When you use the tool:</strong> the content you create — roadmap
      names, item titles, dates, statuses, owners, notes, and the
      relationships between them. Each change is recorded in an audit log
      along with your user ID and a timestamp.
    </p>
    <p>
      <strong>What we do not collect:</strong> your IP address (beyond
      transient logs from infrastructure providers), your location, browser
      fingerprint, or behavioral analytics. There are no third-party trackers,
      advertising pixels, or session-recording tools on this site.
    </p>

    <h2 className={styles.section}>How we use it</h2>
    <p>
      We use your data to run the product — to authenticate you, display your
      roadmaps, sync changes between your devices, and let collaborators see
      what you have shared with them. We do not sell, rent, or share your data
      with third parties for marketing, model training, or any other purpose.
    </p>

    <h2 className={styles.section}>Sub-processors</h2>
    <p>
      Birdbrain Roadmaps relies on the following third-party services to
      function:
    </p>
    <ul>
      <li>
        <strong>Supabase, Inc.</strong> — hosts the database and handles
        authentication. Data is stored in their US-region infrastructure. See{" "}
        <a
          href="https://supabase.com/privacy"
          target="_blank"
          rel="noreferrer"
        >
          supabase.com/privacy
        </a>
        .
      </li>
      <li>
        <strong>Cloudflare, Inc.</strong> — serves the static web application
        from its global edge network. See{" "}
        <a
          href="https://www.cloudflare.com/privacypolicy/"
          target="_blank"
          rel="noreferrer"
        >
          cloudflare.com/privacypolicy
        </a>
        .
      </li>
      <li>
        <strong>Resend, Inc.</strong> — delivers sign-in emails. See{" "}
        <a
          href="https://resend.com/legal/privacy-policy"
          target="_blank"
          rel="noreferrer"
        >
          resend.com/legal/privacy-policy
        </a>
        .
      </li>
      <li>
        <strong>Functional Software, Inc. (Sentry)</strong> — receives
        anonymous error reports (stack traces and your user ID, but{" "}
        <em>not</em> your email or name) when something in the app crashes.
        We use this to find and fix bugs. Stack traces may include
        user-entered text such as item titles or notes — another reason not
        to put sensitive data into the app. See{" "}
        <a
          href="https://sentry.io/privacy/"
          target="_blank"
          rel="noreferrer"
        >
          sentry.io/privacy
        </a>
        .
      </li>
    </ul>
    <p>
      These providers may access your data only as needed to deliver their
      service.
    </p>

    <h2 className={styles.section}>Where your data lives</h2>
    <p>
      All application data is hosted in the United States by Supabase
      (servers in Virginia). Connections to the application use HTTPS
      (encrypted in transit). Database storage is encrypted at rest by
      Supabase.
    </p>
    <p>
      The operator (data controller) is an individual based in the United
      States, relocating to the Republic of Korea. Administrative access to
      operate the service may occur from Korea. The data itself does not
      leave the US-region Supabase infrastructure.
    </p>

    <h2 className={styles.section}>Healthcare data — important</h2>
    <p>
      This service is <strong>not</strong> intended for storing Protected
      Health Information (PHI) as defined by HIPAA. The underlying
      infrastructure is not covered by a Business Associate Agreement. Do not
      enter patient information, medical records, or any data subject to
      HIPAA, GDPR special categories, or similar regulations. If you do, you
      are responsible for any resulting consequences.
    </p>

    <h2 className={styles.section}>Cookies and local storage</h2>
    <p>
      This site does not use cookies or local storage for tracking or
      advertising. We do use a few small entries in your browser's
      localStorage:
    </p>
    <ul>
      <li>
        Your sign-in session (issued by Supabase Auth, valid for seven days).
      </li>
      <li>
        A flag remembering whether you've dismissed the "Getting started"
        tips card.
      </li>
      <li>
        Supabase Auth's own internal entries for token refresh.
      </li>
    </ul>
    <p>
      You can clear any of these at any time via your browser settings.
      Clearing them will sign you out and reset the dismissed-tips flag, but
      no roadmap content is lost.
    </p>

    <h2 className={styles.section}>Audit log retention</h2>
    <p>
      Every create, update, and delete action is recorded in an internal
      audit log so changes can be reviewed and reversed. Audit entries are
      retained indefinitely for the life of the service and are not
      purged when an item is deleted. If you request account deletion (see
      below), your audit entries are anonymized — your user ID is removed —
      but the action records themselves persist.
    </p>

    <h2 className={styles.section}>Your rights</h2>
    <p>
      You can view, edit, or delete any roadmap or item from inside the app
      at any time. Admin users can export all data via the Admin page. You
      can request that your account and associated content be deleted by
      emailing the address below. Account deletion is currently a manual
      process; we aim to honor requests within 30 days. Backups may retain
      your data for up to 90 additional days before being purged.
    </p>

    <h2 className={styles.section}>Changes</h2>
    <p>
      If this policy changes, the "Last updated" date will change and the
      new text will be posted here. For material changes you'll be
      re-prompted to accept the updated terms the next time you sign in.
    </p>

    <h2 className={styles.section}>Contact</h2>
    <p>
      Privacy questions or deletion requests:{" "}
      <a href="mailto:support@birdbrain.tools">support@birdbrain.tools</a>.
    </p>
  </div>
);

export const LegalTermsPage = () => (
  <div className={styles.wrap}>
    <h1 className={styles.title}>Terms of Use</h1>
    <p className={styles.lastUpdated}>
      <em>Last updated: {LAST_UPDATED}</em>
    </p>

    <p>
      Birdbrain Roadmaps is a free, open-source roadmapping tool offered as a
      personal side project. By using <strong>birdbrain.tools</strong>, you
      agree to these terms.
    </p>

    <h2 className={styles.section}>The service is provided "as is"</h2>
    <p>
      This service is provided free of charge, on a best-effort basis, with no
      warranty of any kind. It is not a commercial product. It may have bugs,
      lose data, behave unexpectedly, or become unavailable. Back up critical
      work elsewhere. The full disclaimer is in the MIT License that ships
      with the source code.
    </p>

    <h2 className={styles.section}>Scope and audience</h2>
    <p>
      Birdbrain Roadmaps is currently a single-tenant service. Access to the
      hosted instance at birdbrain.tools is restricted to email addresses on
      the <strong>nyulangone.org</strong> domain, the maintainer's own
      account, and any future co-maintainers. NYU Langone Health is the only
      organization currently using this hosted instance.
    </p>
    <p>
      The service may, in the future, be expanded to a multi-tenant
      architecture. In that event, each tenant's data will remain isolated
      from every other tenant's data, accessible only to members of that
      tenant.
    </p>
    <p>
      <strong>Not endorsed by NYU Langone Health.</strong> Birdbrain
      Roadmaps is operated by an individual on a personal basis. It is not
      endorsed by, contracted with, owned by, or covered under any
      enterprise agreement, security review, or vendor relationship with
      NYU Langone Health or any other organization. Your use of this
      service is voluntary and does not extend any rights or obligations
      between you and your employer.
    </p>

    <h2 className={styles.section}>Who can use it</h2>
    <p>
      Anyone with a valid email address whose domain is on the allowed-domains
      list. Self-hosters configure their own allow-list.
    </p>

    <h2 className={styles.section}>Acceptable use</h2>
    <p>You agree not to:</p>
    <ul>
      <li>
        Upload Protected Health Information (PHI), patient records, or other
        data regulated by HIPAA, GDPR special categories, PCI-DSS, FERPA, or
        similar regimes. This service has no Business Associate Agreement and
        is not appropriate for such data.
      </li>
      <li>Use the service for any unlawful purpose.</li>
      <li>
        Attempt to break, overload, scrape, or interfere with the service or
        other users' experience.
      </li>
      <li>
        Use the service to send spam, phishing attempts, or malware.
      </li>
      <li>Share access credentials or impersonate another person.</li>
    </ul>
    <p>Violations may result in your access being revoked without notice.</p>

    <h2 className={styles.section}>Your content</h2>
    <p>
      You retain ownership of the content you create on Birdbrain Roadmaps.
      You grant the maintainer of birdbrain.tools only the limited rights
      necessary to host, display, back up, and deliver that content to you and
      your collaborators. You can export or delete your data at any time.
    </p>

    <h2 className={styles.section}>Confidentiality</h2>
    <p>
      Roadmap data may include confidential information belonging to your
      employer or other parties. You are responsible for ensuring that any
      information you upload may lawfully be placed on a third-party service.
      Birdbrain Roadmaps does not make confidentiality guarantees beyond
      standard industry practice.
    </p>

    <h2 className={styles.section}>Limitation of liability</h2>
    <p>
      To the maximum extent permitted by law, the maintainer of Birdbrain
      Roadmaps shall not be liable for any direct, indirect, incidental,
      special, consequential, or exemplary damages — including lost profits,
      lost data, business interruption, or other commercial damages — arising
      from your use of Birdbrain Roadmaps, even if advised of the possibility
      of such damages.
    </p>

    <h2 className={styles.section}>No fees, no business relationship</h2>
    <p>
      Use of birdbrain.tools is free. There are no subscriptions, paywalls, or
      in-app purchases. The maintainer is not your employee, contractor,
      vendor, agent, or business associate. Using this tool creates no
      employment, service, partnership, joint venture, or similar
      relationship.
    </p>

    <h2 className={styles.section}>Termination</h2>
    <p>
      You may stop using the service at any time. The maintainer may suspend
      or terminate your access — or discontinue the service entirely — at any
      time and for any reason. Reasonable notice will be given for planned
      discontinuation when feasible.
    </p>

    <h2 className={styles.section}>Open source</h2>
    <p>
      The source code is available at{" "}
      <a
        href="https://github.com/andrewcaster315/birdbrain-roadmaps"
        target="_blank"
        rel="noreferrer"
      >
        github.com/andrewcaster315/birdbrain-roadmaps
      </a>{" "}
      under the MIT License. You are welcome to fork, modify, and self-host.
      The MIT License governs use of the code; these Terms govern use of the
      hosted service at birdbrain.tools.
    </p>

    <h2 className={styles.section}>Governing law</h2>
    <p>
      These terms are governed by the laws of the State of New York, without
      regard to its conflict-of-laws principles. Disputes shall be resolved in
      the state or federal courts located in New York County, New York.
    </p>

    <h2 className={styles.section}>Changes</h2>
    <p>
      If these terms change, the "Last updated" date will change and the new
      text will be posted here. Continued use of the service after changes
      constitutes acceptance.
    </p>

    <h2 className={styles.section}>Contact</h2>
    <p>
      Questions or concerns:{" "}
      <a href="mailto:support@birdbrain.tools">support@birdbrain.tools</a>.
    </p>
  </div>
);
