// Task 5.1–5.5 — LandingPage card filtering by user.scope.modules.
// AuthProvider restores session from localStorage on mount, so each scenario
// seeds it directly instead of mocking useAuth().

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { BrowserRouter, MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../../features/authentication/auth-context";
import { LandingPage } from "../../features/authentication/landing-page";

const ALL_MODULE_TITLES = [
  "Infraestructura",
  "Flota",
  "Personal",
  "Alertas Operativas",
  "Panel Operativo Central",
  "Reportes Administrativos",
  "Auditoría",
  "Recarga",
  "Perfil",
];

function seedSession(modules: string[]) {
  localStorage.setItem("transmetro_token", "fake-jwt");
  localStorage.setItem(
    "transmetro_user",
    JSON.stringify({
      employeeId: "emp-1",
      email: "user@transmetro.gt",
      roles: ["OPERADOR_CENTRAL"],
      permissions: [],
      scope: { role: "OPERADOR_CENTRAL", modules },
    }),
  );
}

function renderLandingPage() {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <LandingPage />
      </AuthProvider>
    </BrowserRouter>,
  );
}

describe("LandingPage card filtering (task 5)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders exactly the cards present in scope.modules (partial access)", async () => {
    seedSession(["fleet", "audit_log", "self_profile"]);
    renderLandingPage();

    expect(await screen.findByText("Flota")).toBeInTheDocument();
    expect(screen.getByText("Auditoría")).toBeInTheDocument();
    expect(screen.getByText("Perfil")).toBeInTheDocument();

    for (const title of ALL_MODULE_TITLES) {
      if (["Flota", "Auditoría", "Perfil"].includes(title)) continue;
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    }
  });

  it("renders all 9 cards for a user with full module access", async () => {
    seedSession([
      "infrastructure",
      "fleet",
      "personnel",
      "operational_alerts",
      "central_operations_panel",
      "administrative_reports",
      "audit_log",
      "recharge_reporting",
      "self_profile",
    ]);
    renderLandingPage();

    expect(await screen.findByText("Infraestructura")).toBeInTheDocument();
    for (const title of ALL_MODULE_TITLES) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it("navigates to /fleet when the Flota card is clicked and marks it clickable", async () => {
    seedSession(["fleet", "audit_log"]);
    render(
      <MemoryRouter initialEntries={["/landing"]}>
        <AuthProvider>
          <Routes>
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/fleet" element={<div>Fleet destination</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    const fleetCard = (await screen.findByText("Flota")).closest("div[class*='border']") as HTMLElement;
    expect(fleetCard.className).toContain("cursor-pointer");
    const auditCard = screen.getByText("Auditoría").closest("div[class*='border']") as HTMLElement;
    expect(auditCard.className).not.toContain("cursor-pointer");

    fireEvent.click(fleetCard);
    expect(await screen.findByText("Fleet destination")).toBeInTheDocument();
  });

  it("renders no module cards but keeps the title and sign-out section when scope.modules is empty", async () => {
    seedSession([]);
    renderLandingPage();

    expect(await screen.findByRole("heading", { name: "Administration Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    for (const title of ALL_MODULE_TITLES) {
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    }
  });
});
