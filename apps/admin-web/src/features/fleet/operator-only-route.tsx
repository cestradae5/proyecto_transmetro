import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../authentication/auth-context";
import { FLEET_MANAGE_PERMISSION, FLEET_STATION_VIEW_PERMISSION, hasPermission } from "./permissions";

interface OperatorOnlyRouteProps {
  children: ReactNode;
}

/**
 * Guards the operator fleet view: without FLOTA_GESTIONAR every endpoint it
 * calls answers 403, so a station operator is sent to their station view and
 * anyone else (a pilot) to their own unit view.
 * Authentication and module scope are already enforced by
 * `AuthenticationGuard requiredModule="fleet"` on the route.
 */
export function OperatorOnlyRoute({ children }: OperatorOnlyRouteProps) {
  const { user } = useAuth();

  if (!hasPermission(user, FLEET_MANAGE_PERMISSION)) {
    const destination = hasPermission(user, FLEET_STATION_VIEW_PERMISSION) ? "/fleet/my-station" : "/fleet/my-unit";
    return <Navigate to={destination} replace />;
  }

  return <>{children}</>;
}
