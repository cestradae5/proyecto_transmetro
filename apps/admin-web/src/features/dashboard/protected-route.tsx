import { Navigate } from "react-router-dom";
import { useAuth } from "../authentication/auth-context";

interface ProtectedRouteProps {
  children: React.ReactNode;
  // Module key required in user.scope.modules (see PERMISSION_TO_MODULE in
  // apps/api/src/authentication/authentication.service.ts). Omit to only
  // require authentication, matching existing routes like /profile.
  requiredModule?: string;
}

export function AuthenticationGuard({ children, requiredModule }: ProtectedRouteProps) {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center">
        <span className="text-slate-500 font-display text-lg">Cargando...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredModule) {
    const modules = user?.scope?.modules ?? [];
    if (!modules.includes(requiredModule)) {
      return <Navigate to="/landing" replace />;
    }
  }

  return <>{children}</>;
}
