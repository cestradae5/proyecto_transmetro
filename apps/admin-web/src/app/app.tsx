import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "../features/authentication/login-page";
import { LandingPage } from "../features/authentication/landing-page";
import { GISPage } from "../features/authentication/gis-page";
import { ProfilePage } from "../features/dashboard/profile-page";
import { InfrastructurePage } from "../features/infrastructure";
import { FleetPage } from "../features/fleet";
import { PersonalPage } from "../features/personal";
import { AuditLogPage } from "../features/audit-log";
import { AdministrativeReportsPage, ReportsHubPage } from "../features/reports";
import { ReportsPermissionRoute } from "../features/reports/reports-permission-route";
import { canOpenReportsPage, canViewAuditLog } from "../features/reports/permissions";
import { MiUnidadPage } from "../features/fleet/components/mi-unidad/mi-unidad-page";
import { MiEstacionPage } from "../features/fleet/components/mi-estacion/mi-estacion-page";
import { OperatorOnlyRoute } from "../features/fleet/operator-only-route";
import { AlertsPage } from "../features/operational-alerts";
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
          <Route path="/fleet" element={<AuthenticationGuard requiredModule="fleet"><OperatorOnlyRoute><FleetPage /></OperatorOnlyRoute></AuthenticationGuard>} />
          <Route path="/fleet/my-unit" element={<AuthenticationGuard requiredModule="fleet"><MiUnidadPage /></AuthenticationGuard>} />
          <Route path="/fleet/my-station" element={<AuthenticationGuard requiredModule="fleet"><MiEstacionPage /></AuthenticationGuard>} />
          <Route path="/alerts" element={<AuthenticationGuard requiredModule="operational_alerts"><AlertsPage /></AuthenticationGuard>} />
          <Route path="/personal" element={<AuthenticationGuard requiredModule="personnel"><PersonalPage /></AuthenticationGuard>} />
          <Route path="/reports" element={<AuthenticationGuard requiredModule="reports"><ReportsHubPage /></AuthenticationGuard>} />
          <Route path="/reports/audit-log" element={<AuthenticationGuard requiredModule="reports"><ReportsPermissionRoute allowed={canViewAuditLog}><AuditLogPage /></ReportsPermissionRoute></AuthenticationGuard>} />
          <Route path="/reports/administrative" element={<AuthenticationGuard requiredModule="reports"><ReportsPermissionRoute allowed={canOpenReportsPage}><AdministrativeReportsPage /></ReportsPermissionRoute></AuthenticationGuard>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
