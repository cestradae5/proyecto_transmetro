import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../authentication/auth-context";
import { FLEET_MANAGE_PERMISSION, hasPermission } from "./permissions";

interface OperatorOnlyRouteProps {
  children: ReactNode;
}

/**
 * Guards the operator fleet view: without FLOTA_GESTIONAR every endpoint it
 * calls answers 403, so a pilot is sent to their own unit view instead.
 * Authentication and module scope are already enforced by
 * `AuthenticationGuard requiredModule="fleet"` on the route.
 */
export function OperatorOnlyRoute({ children }: OperatorOnlyRouteProps) {
  const { user } = useAuth();

  if (!hasPermission(user, FLEET_MANAGE_PERMISSION)) {
    return <Navigate to="/fleet/my-unit" replace />;
  }

  return <>{children}</>;
}
