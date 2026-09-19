// ============================================================================
// TESTS — Authentication Unit Tests
// Vitest/Testing Library tests for authentication components.
// ============================================================================

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { LoginPage } from "../../features/authentication/login-page";
import { LandingPage } from "../../features/authentication/landing-page";
import { GISPage } from "../../features/authentication/gis-page";

describe("LoginPage", () => {
  it("renders login heading", () => {
    render(<LoginPage />);
    expect(screen.getByText("Iniciar Sesión")).toBeInTheDocument();
  });

  it("renders Google login button", () => {
    render(<LoginPage />);
    expect(screen.getByText("Continuar con Google")).toBeInTheDocument();
  });
});

describe("LandingPage", () => {
  it("renders administration dashboard heading", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: "Administration Dashboard" })).toBeInTheDocument();
  });

  it("renders sign out button", () => {
    render(<LandingPage />);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});

describe("GISPage", () => {
  it("renders GIS map heading", () => {
    render(<GISPage />);
    expect(screen.getByRole("heading", { name: "GIS Map" })).toBeInTheDocument();
  });
});
