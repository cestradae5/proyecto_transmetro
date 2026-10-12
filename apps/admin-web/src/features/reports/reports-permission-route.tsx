import { Navigate } from "react-router-dom";
import { useAuth, type User } from "../authentication/auth-context";

interface ReportsPermissionRouteProps {
  allowed: (user: Pick<User, "permissions"> | null | undefined) => boolean;
  children: React.ReactNode;
}

/** Inside the Reportes module: a submodule the user may not open sends them back to the hub. */
export function ReportsPermissionRoute({ allowed, children }: ReportsPermissionRouteProps) {
  const { user } = useAuth();
  return allowed(user) ? <>{children}</> : <Navigate to="/reports" replace />;
}
