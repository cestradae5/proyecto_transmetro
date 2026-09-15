### E2E Tests: Administrative Shell

**Suite ID:** `ADMIN-SHELL`
**Feature:** Administrative application shell

---

## Test Case: `ADMIN-SHELL-E2E-001` - Render the shell

**Priority:** `critical`

**Tags:**
- type → @e2e
- feature → @admin-shell

**Description/Objective:** Verify that the production build mounts the administrative shell.

**Preconditions:**
- The admin web production build exists.
- A compatible Chromium browser is available to Playwright.

### Flow Steps:
1. Open the application root.
2. Locate the administrative heading.
3. Locate the platform status message.

### Expected Result:
- The administrative heading is visible.
- The platform status message is visible.
