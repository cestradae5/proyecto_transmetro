// ============================================================================
// TESTS RED — Authentication E2E Playwright (task 3.2)
// Estos tests definen el comportamiento de autenticación del admin-web
// ANTES de implementar las páginas de login, landing, logout y GIS.
// Cada test falla (RED) hasta que la UI implemente la regla correspondiente.
// ============================================================================

import { expect, test } from "@playwright/test";

const ADMIN_ORIGIN = "http://127.0.0.1:4173";
const LOGIN_PAGE = "/login";
const LANDING_PAGE = "/landing";
const ADMIN_PAGE = "/admin";
const GIS_PAGE = "/gis";

test.describe("Authentication E2E (RED)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ADMIN_ORIGIN);
  });

  // --------------------------------------------------------------------------
  // Anonymous access
  // --------------------------------------------------------------------------
  test("anonymous user is redirected to login when accessing protected routes", async ({ page }) => {
    await page.goto(`${ADMIN_ORIGIN}${ADMIN_PAGE}`);
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}${LOGIN_PAGE}`);
    await expect(page.getByText("Sign in to continue")).toBeVisible();
  });

  test("anonymous user cannot access the landing page without authentication", async ({ page }) => {
    await page.goto(`${ADMIN_ORIGIN}${LANDING_PAGE}`);
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}${LOGIN_PAGE}`);
  });

  test("anonymous user can access the root page without authentication", async ({ page }) => {
    await page.goto(ADMIN_ORIGIN);
    await expect(page.getByRole("heading", { name: "Transmetro Administration" })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Denial / unauthorized access
  // --------------------------------------------------------------------------
  test("user with expired session is denied access and redirected to login", async ({ page }) => {
    await page.addCookies([
      {
        name: "__Host-transmetro_admin_session",
        value: "expired-session-hash",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "none",
        domain: "127.0.0.1",
      },
    ]);
    await page.goto(`${ADMIN_ORIGIN}${ADMIN_PAGE}`);
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}${LOGIN_PAGE}`);
    await expect(page.getByText("Session expired. Please sign in again.")).toBeVisible();
  });

  test("user without permissions is denied access to administration page", async ({ page }) => {
    await page.addCookies([
      {
        name: "__Host-transmetro_admin_session",
        value: "limited-session-hash",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "none",
        domain: "127.0.0.1",
      },
    ]);
    await page.goto(`${ADMIN_ORIGIN}${ADMIN_PAGE}`);
    await expect(page.getByText("Access denied. Insufficient permissions.")).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Login
  // --------------------------------------------------------------------------
  test("login page renders with credential form", async ({ page }) => {
    await page.goto(`${ADMIN_ORIGIN}${LOGIN_PAGE}`);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Google ID token")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("successful login redirects to landing page and sets session cookie", async ({ page }) => {
    await page.goto(`${ADMIN_ORIGIN}${LOGIN_PAGE}`);
    await page.getByLabel("Google ID token").fill("valid-id-token");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}${LANDING_PAGE}`);
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === "__Host-transmetro_admin_session");
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.value).toMatch(/^[a-f0-9]{64}$/);
  });

  test("login with invalid credentials shows error message", async ({ page }) => {
    await page.goto(`${ADMIN_ORIGIN}${LOGIN_PAGE}`);
    await page.getByLabel("Google ID token").fill("invalid-token");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Authentication failed. Please try again.")).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Protected landing
  // --------------------------------------------------------------------------
  test("authenticated user can access the landing page", async ({ page }) => {
    await page.addCookies([
      {
        name: "__Host-transmetro_admin_session",
        value: "valid-session-hash",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "none",
        domain: "127.0.0.1",
      },
    ]);
    await page.goto(`${ADMIN_ORIGIN}${LANDING_PAGE}`);
    await expect(page.getByRole("heading", { name: "Administration Dashboard" })).toBeVisible();
  });

  test("authenticated user sees GIS link on landing page", async ({ page }) => {
    await page.addCookies([
      {
        name: "__Host-transmetro_admin_session",
        value: "valid-session-hash",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "none",
        domain: "127.0.0.1",
      },
    ]);
    await page.goto(`${ADMIN_ORIGIN}${LANDING_PAGE}`);
    await expect(page.getByRole("link", { name: "GIS" })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Logout
  // --------------------------------------------------------------------------
  test("logout clears session cookie and redirects to login", async ({ page }) => {
    await page.addCookies([
      {
        name: "__Host-transmetro_admin_session",
        value: "valid-session-hash",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "none",
        domain: "127.0.0.1",
      },
    ]);
    await page.goto(`${ADMIN_ORIGIN}${LANDING_PAGE}`);
    await page.getByRole("button", { name: "Sign out" }).click();
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === "__Host-transmetro_admin_session");
    expect(sessionCookie).toBeUndefined();
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}${LOGIN_PAGE}`);
  });

  test("logout button is visible on landing page", async ({ page }) => {
    await page.addCookies([
      {
        name: "__Host-transmetro_admin_session",
        value: "valid-session-hash",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "none",
        domain: "127.0.0.1",
      },
    ]);
    await page.goto(`${ADMIN_ORIGIN}${LANDING_PAGE}`);
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Mocked GIS
  // --------------------------------------------------------------------------
  test("authenticated user can access GIS page with mocked data", async ({ page }) => {
    await page.addCookies([
      {
        name: "__Host-transmetro_admin_session",
        value: "valid-session-hash",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "none",
        domain: "127.0.0.1",
      },
    ]);
    await page.goto(`${ADMIN_ORIGIN}${GIS_PAGE}`);
    await expect(page.getByRole("heading", { name: "GIS Map" })).toBeVisible();
    await expect(page.getByText("Mocked GIS data loaded")).toBeVisible();
  });

  test("unauthenticated user cannot access GIS page", async ({ page }) => {
    await page.goto(`${ADMIN_ORIGIN}${GIS_PAGE}`);
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}${LOGIN_PAGE}`);
  });
});
