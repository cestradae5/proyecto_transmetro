// ============================================================================
// TESTS — Authentication Unit Tests
// Vitest/Testing Library tests for authentication components.
// ============================================================================

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../../features/authentication/auth-context";
import { LoginPage } from "../../features/authentication/login-page";
import { LandingPage } from "../../features/authentication/landing-page";
import { GISPage } from "../../features/authentication/gis-page";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <BrowserRouter>
      <AuthProvider>{ui}</AuthProvider>
    </BrowserRouter>,
  );
}

describe("LoginPage", () => {
  it("renders login heading", () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByText("Iniciar Sesión")).toBeInTheDocument();
  });

  it("renders Google login button", () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByText("Continuar con Google")).toBeInTheDocument();
  });
});

describe("LandingPage", () => {
  it("renders administration dashboard heading", () => {
    renderWithProviders(<LandingPage />);
    expect(screen.getByRole("heading", { name: "Administration Dashboard" })).toBeInTheDocument();
  });

  it("renders sign out button", () => {
    renderWithProviders(<LandingPage />);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});

describe("GISPage", () => {
  it("renders GIS map heading", () => {
    renderWithProviders(<GISPage />);
    expect(screen.getByRole("heading", { name: "GIS Map" })).toBeInTheDocument();
  });
});
