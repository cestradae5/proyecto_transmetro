// Route wiring for /personal: requires module "personnel". The page itself is
// covered in personal-page.spec.tsx, so it is stubbed here.

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { useAuth } from "../../features/authentication/auth-context";
import type { User } from "../../features/authentication/auth-context";

vi.mock("../../features/authentication/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../../features/authentication/auth-context")>(
    "../../features/authentication/auth-context",
  );
  return { ...actual, useAuth: vi.fn() };
});
vi.mock("../../features/personal", () => ({ PersonalPage: () => <div>Personal page</div> }));

import { App } from "../../app/app";

const mockedUseAuth = useAuth as unknown as Mock;

function user(modules: string[]): User {
  return {
    email: "user@transmetro.gt",
    employeeId: "emp-1",
    roles: ["OPERADOR_CENTRAL"],
    permissions: [],
    scope: { role: "OPERADOR_CENTRAL", modules },
  };
}

function signIn(u: User | null) {
  mockedUseAuth.mockReturnValue({
    user: u,
    token: "fake-jwt",
    isAuthenticated: u !== null,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function renderApp(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, "", "/");
});

describe("personal routes", () => {
  it("renders PersonalPage at /personal for a user with module personnel", () => {
    signIn(user(["personnel"]));
    renderApp("/personal");
    expect(screen.getByText("Personal page")).toBeInTheDocument();
  });

  it("redirects /personal to /landing when the user lacks module personnel", () => {
    signIn(user(["fleet"]));
    renderApp("/personal");
    expect(screen.queryByText("Personal page")).not.toBeInTheDocument();
    expect(screen.getByText("Administration Dashboard")).toBeInTheDocument();
  });

  it("redirects /personal to /login when unauthenticated", () => {
    signIn(null);
    renderApp("/personal");
    expect(screen.getByRole("heading", { name: "Iniciar Sesión" })).toBeInTheDocument();
  });
});
