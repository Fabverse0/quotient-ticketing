import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import type { Role } from "../api/auth";
import { homeFor, useSession } from "../auth/session";
import { PageLoading } from "./PageState";

// Signed out goes to /masuk; the wrong role goes to its own home page.
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useSession();
  const location = useLocation();
  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/masuk" replace state={{ from: location.pathname }} />;
  if (user.role !== role) return <Navigate to={homeFor(user)} replace />;
  return children;
}
