// ============================================================================
// TESTS RED — Authentication Unit Tests (task 3.2)
// Vitest/Testing Library tests for authentication logic.
// These tests FAIL until the authentication components are implemented.
// ============================================================================

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { lazy, Suspense } from "react";

// Components don't exist yet — Task 4.1 GREEN will implement them
const LazyLoginPage = lazy(() => import("../../features/authentication/login-page"));
const LazyLandingPage = lazy(() => import("../../features/authentication/landing-page"));
const LazyLogoutButton = lazy(() => import("../../features/authentication/logout-button"));
const LazyGISPage = lazy(() => import("../../features/authentication/gis-page"));

function renderLazy(Component: React.ComponentType) {
  return render(
    <Suspense fallback={<div>Loading...</div>}>
      <Component />
    </Suspense>,
  );
}

describe("Anonymous access (RED)", () => {
  it("shows login page for unauthenticated users", async () => {
    const { LoginPage } = await import("../../features/authentication/login-page");
    renderLazy(LoginPage);
    expect(screen.getByText("Sign in to continue")).toBeInTheDocument();
  });
});

describe("Login flow (RED)", () => {
  it("validates Google ID token on form submission", async () => {
    const { LoginPage } = await import("../../features/authentication/login-page");
    renderLazy(LoginPage);
    expect(screen.getByLabelText("Google ID token")).toBeInTheDocument();
  });
});

describe("Protected landing (RED)", () => {
  it("shows administration dashboard for authenticated users", async () => {
    const { LandingPage } = await import("../../features/authentication/landing-page");
    renderLazy(LandingPage);
    expect(screen.getByRole("heading", { name: "Administration Dashboard" })).toBeInTheDocument();
  });
});

describe("Logout (RED)", () => {
  it("clears session and redirects on logout", async () => {
    const { LogoutButton } = await import("../../features/authentication/logout-button");
    renderLazy(LogoutButton);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});

describe("Mocked GIS (RED)", () => {
  it("renders GIS map with mocked data for authenticated users", async () => {
    const { GISPage } = await import("../../features/authentication/gis-page");
    renderLazy(GISPage);
    expect(screen.getByRole("heading", { name: "GIS Map" })).toBeInTheDocument();
  });
});
