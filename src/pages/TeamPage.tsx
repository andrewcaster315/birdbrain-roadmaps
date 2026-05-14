// Deprecated: replaced by GroupPage. Kept as a redirect for any stale imports.
import { Navigate, useParams } from "react-router-dom";

export const TeamPage = () => {
  const { teamId } = useParams<{ teamId: string }>();
  return <Navigate to={`/groups/${teamId ?? ""}`} replace />;
};
