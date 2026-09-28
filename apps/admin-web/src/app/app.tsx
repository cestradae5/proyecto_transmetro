import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "../features/authentication/login-page";
import { LandingPage } from "../features/authentication/landing-page";
import { GISPage } from "../features/authentication/gis-page";
import { ProfilePage } from "../features/dashboard/profile-page";
import { InfrastructurePage } from "../features/infrastructure";
import { AuthProvider } from "../features/authentication/auth-context";
import { AuthenticationGuard } from "../features/dashboard/protected-route";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/landing" element={<AuthenticationGuard><LandingPage /></AuthenticationGuard>} />
          <Route path="/gis" element={<GISPage />} />
          <Route path="/profile" element={<AuthenticationGuard><ProfilePage /></AuthenticationGuard>} />
          <Route path="/infrastructure" element={<AuthenticationGuard requiredModule="infrastructure"><InfrastructurePage /></AuthenticationGuard>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
