import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { SignIn } from "./auth/SignIn";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { GroupPage } from "./pages/GroupPage";
import { RoadmapPage } from "./pages/RoadmapPage";
import { TrashPage } from "./pages/TrashPage";
import { AdminPage } from "./pages/AdminPage";
import { LegalPrivacyPage, LegalTermsPage } from "./pages/LegalPages";
import { useData } from "./data/DataContext";

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

export const App = () => {
  const { isAuthenticated, authResolved } = useAuth();
  const { loaded } = useData();
  // Don't render the sign-in screen until we know whether the user is signed
  // in or not — otherwise refreshing a page flashes sign-in for a moment.
  if (!authResolved) return <LoadingScreen />;
  if (!isAuthenticated) return <SignIn />;
  if (!loaded) return <LoadingScreen />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/groups/:groupId" element={<GroupPage />} />
        <Route path="/teams/:teamId" element={<TeamsRedirect />} />
        <Route path="/roadmaps/:roadmapId" element={<RoadmapPage />} />
        <Route path="/trash" element={<TrashPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/legal/privacy" element={<LegalPrivacyPage />} />
        <Route path="/legal/terms" element={<LegalTermsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
};
