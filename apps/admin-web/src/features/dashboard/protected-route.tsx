import { Navigate } from "react-router-dom";
import { useAuth } from "../authentication/auth-context";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function AuthenticationGuard({ children }: ProtectedRouteProps) {
  const { isAuthenticated, loading } = useAuth();

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

  return <>{children}</>;
}
