# Authentication E2E Tests — Admin Web

**Suite ID:** `AUTH-E2E`
**Feature:** Authentication flow for administrative web application
**Framework:** Playwright + Vitest + Testing Library
**Status:** RED (components not yet implemented — Task 4.1 GREEN)

---

## Test Case: `AUTH-E2E-001` — Anonymous access redirection

**Priority:** `critical`
**Tags:** `@e2e`, `@auth`, `@anonymous`

**Description:** Verify that unauthenticated users are redirected to the login page when accessing protected routes.

**Preconditions:**
- Admin web production build exists.
- Chromium browser available to Playwright.

### Flow Steps:
1. Navigate to `/admin` without session cookie.
2. Verify redirection to `/login`.
3. Verify "Sign in to continue" message is visible.

### Expected Result:
- URL changes to `/login`.
- Login heading and form are visible.

---

## Test Case: `AUTH-E2E-002` — Denial / unauthorized access

**Priority:** `critical`
**Tags:** `@e2e`, `@auth`, `@denial`

**Description:** Verify that users with expired or insufficient sessions are denied access.

**Preconditions:**
- Admin web production build exists.

### Flow Steps:
1. Set expired session cookie.
2. Navigate to `/admin`.
3. Verify redirection to `/login` with "Session expired" message.

### Expected Result:
- User is redirected to login with appropriate error message.

---

## Test Case: `AUTH-E2E-003` — Login flow

**Priority:** `critical`
**Tags:** `@e2e`, `@auth`, `@login`

**Description:** Verify the complete login flow with Google ID token authentication.

**Preconditions:**
- Admin web production build exists.

### Flow Steps:
1. Navigate to `/login`.
2. Enter valid Google ID token.
3. Click "Sign in".
4. Verify redirect to `/landing`.
5. Verify session cookie is set.

### Expected Result:
- User is redirected to landing page.
- Session cookie (`__Host-transmetro_admin_session`) is present.
- Cookie value is a valid SHA-256 hash (64 hex chars).

---

## Test Case: `AUTH-E2E-004` — Protected landing

**Priority:** `critical`
**Tags:** `@e2e`, `@auth`, `@landing`

**Description:** Verify that authenticated users can access the administration dashboard.

**Preconditions:**
- Valid session cookie is set.

### Flow Steps:
1. Set valid session cookie.
2. Navigate to `/landing`.
3. Verify "Administration Dashboard" heading is visible.
4. Verify GIS link is present.
5. Verify "Sign out" button is visible.

### Expected Result:
- Dashboard is visible with all navigation elements.

---

## Test Case: `AUTH-E2E-005` — Logout

**Priority:** `high`
**Tags:** `@e2e`, `@auth`, `@logout`

**Description:** Verify that logout clears the session cookie and redirects to login.

**Preconditions:**
- Valid session cookie is set.
- User is on `/landing`.

### Flow Steps:
1. Click "Sign out".
2. Verify session cookie is removed.
3. Verify redirection to `/login`.

### Expected Result:
- Session cookie is cleared (`Max-Age=0`).
- User is redirected to login page.

---

## Test Case: `AUTH-E2E-006` — Mocked GIS

**Priority:** `high`
**Tags:** `@e2e`, `@auth`, `@gis`, `@mocked`

**Description:** Verify that authenticated users can access the GIS page with mocked data.

**Preconditions:**
- Valid session cookie is set.

### Flow Steps:
1. Set valid session cookie.
2. Navigate to `/gis`.
3. Verify "GIS Map" heading is visible.
4. Verify "Mocked GIS data loaded" message is visible.

### Expected Result:
- GIS map renders with mocked data.
- No real GIS API calls are made.

---

## Test Case: `AUTH-E2E-007` — Unauthenticated GIS access denied

**Priority:** `high`
**Tags:** `@e2e`, `@auth`, `@gis`, `@denial`

**Description:** Verify that unauthenticated users cannot access the GIS page.

**Preconditions:**
- No session cookie is set.

### Flow Steps:
1. Navigate to `/gis` without session cookie.
2. Verify redirection to `/login`.

### Expected Result:
- User is redirected to login page.

---

## Security Notes

- All session cookies use `__Host-` prefix requiring `Secure`, `Path=/`, and `HttpOnly`.
- Cookies are set with `SameSite=None` for cross-origin support.
- Session hash is SHA-256 (64 hex characters).
- Session expiry is 12 hours (43200 seconds).

## Mocking Strategy

- GIS data is mocked using Playwright's `page.route()` or vitest mocks.
- No real GIS API calls are made during testing.
- Google credential verifier is mocked with test ID tokens.

## Browser Configuration

- Browser: Chromium
- Base URL: `http://127.0.0.1:4173`
- Viewport: 1280x720
- Timeout: 30000ms
