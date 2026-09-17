import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "../features/authentication/login-page";
import { LandingPage } from "../features/authentication/landing-page";
import { GISPage } from "../features/authentication/gis-page";
import { AdministrativeLanding } from "../features/administration/administrative-landing";
import { AuthProvider, useAuth } from "../features/authentication/auth-context";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/gis" element={<GISPage />} />
          <Route path="/admin" element={<AdministrativeLanding />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
