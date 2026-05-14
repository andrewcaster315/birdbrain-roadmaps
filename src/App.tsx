import { Routes, Route, Navigate, Link, useParams } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { SignIn } from "./auth/SignIn";
import { Layout } from "./components/Layout";
import { TermsGate } from "./components/TermsGate";
import { Toaster } from "./components/Toaster";
import { HomePage } from "./pages/HomePage";
import { GroupPage } from "./pages/GroupPage";
import { RoadmapPage } from "./pages/RoadmapPage";
import { TrashPage } from "./pages/TrashPage";
import { AdminPage } from "./pages/AdminPage";
import { LegalPrivacyPage, LegalTermsPage } from "./pages/LegalPages";
import { useData } from "./data/DataContext";
import type { ReactNode } from "react";

const TeamsRedirect = () => {
  const { teamId } = useParams<{ teamId: string }>();
  return <Navigate to={`/groups/${teamId ?? ""}`} replace />;
};

const LoadingScreen = () => (
  <div
    style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      color: "#64748b",
      fontSize: "14px",
    }}
  >
    Loading your roadmaps…
  </div>
);

// Minimal layout for the legal pages — readable without sign-in and without
// having accepted the Terms. Just a brand link, the content, and a sign-in
// hint. Anyone, anywhere on the internet, can land on these URLs.
const PublicLegalLayout = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "var(--color-bg)",
    }}
  >
    <header
      style={{
        padding: "16px 24px",
        borderBottom: "1px solid var(--color-border)",
        background: "#fff",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Link
        to="/"
        style={{
          fontWeight: 700,
          color: "var(--color-primary)",
          textDecoration: "none",
        }}
      >
        Birdbrain Roadmaps
      </Link>
      <Link
        to="/"
        style={{
          fontSize: 13,
          color: "var(--color-text-muted)",
          textDecoration: "none",
        }}
      >
        ← Back to app
      </Link>
    </header>
    <main style={{ padding: "24px", maxWidth: 768, margin: "0 auto", width: "100%" }}>
      {children}
    </main>
  </div>
);

const GatedApp = () => {
  const { isAuthenticated, authResolved } = useAuth();
  const { loaded } = useData();
  // Don't render the sign-in screen until we know whether the user is signed
  // in or not — otherwise refreshing a page flashes sign-in for a moment.
  if (!authResolved) return <LoadingScreen />;
  if (!isAuthenticated) return <SignIn />;
  if (!loaded) return <LoadingScreen />;
  return (
    <TermsGate>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/groups/:groupId" element={<GroupPage />} />
          <Route path="/teams/:teamId" element={<TeamsRedirect />} />
          <Route path="/roadmaps/:roadmapId" element={<RoadmapPage />} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </TermsGate>
  );
};

export const App = () => (
  <>
    <Routes>
      {/* Legal pages are always public — they live outside both the auth
          gate and the Terms-acceptance gate so people can read them before
          signing in and before deciding whether to accept. */}
      <Route
        path="/legal/privacy"
        element={
          <PublicLegalLayout>
            <LegalPrivacyPage />
          </PublicLegalLayout>
        }
      />
      <Route
        path="/legal/terms"
        element={
          <PublicLegalLayout>
            <LegalTermsPage />
          </PublicLegalLayout>
        }
      />
      <Route path="*" element={<GatedApp />} />
    </Routes>
    {/* Global toast surface — used by the service layer to flag failed
        background saves the user would otherwise never see. */}
    <Toaster />
  </>
);
