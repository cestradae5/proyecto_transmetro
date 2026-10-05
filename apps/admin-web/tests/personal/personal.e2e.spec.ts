// ============================================================================
// E2E — Personal page (employee administration).
//
// Runs against the production build served by `vite preview` on 127.0.0.1:4173,
// so no backend and no database are needed: the session is seeded through
// localStorage (the AuthProvider reads `transmetro_token` / `transmetro_user`)
// and every /personal/* call is fulfilled by page.route().
//
// External assets (Tailwind CDN, Google Fonts) are aborted so the suite is
// deterministic and does not depend on network access.
// ============================================================================

import { expect, test, type Page, type Route } from "@playwright/test";
import type { Empleado, PersonalRole } from "../../src/features/personal/types/personal.types";
import type { User } from "../../src/features/authentication/auth-context";

const PERSONAL_PAGE = "/personal";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ROLES: PersonalRole[] = [
  { id: "1", code: "ADMINISTRADOR_SISTEMA", name: "Administrador del Sistema" },
  { id: "2", code: "PILOTO", name: "Piloto" },
];

const ANA: Empleado = {
  id: "10",
  name: "Ana López",
  email: "ana@transmetro.test",
  status: "ACTIVO",
  roleId: "2",
  roleCode: "PILOTO",
  roleName: "Piloto",
  phone: "+502 5555 0101",
  dpi: "1234567890123",
  hireDate: "2024-03-05",
  address: "Zona 1, Guatemala",
  licenseNumber: null,
  educationHistory: null,
  languages: "Español",
};

const CARLOS: Empleado = {
  ...ANA,
  id: "11",
  name: "Carlos Ruiz",
  email: "carlos@transmetro.test",
  roleId: "1",
  roleCode: "ADMINISTRADOR_SISTEMA",
  roleName: "Administrador del Sistema",
  status: "INACTIVO",
  phone: null,
  dpi: "9876543210987",
  hireDate: null,
};

function seedEmpleados(): Empleado[] {
  return [ANA, CARLOS].map((empleado) => ({ ...empleado }));
}

/** A user who reaches module `personnel` and may mutate employees. */
const MANAGER: User = {
  email: "manager@transmetro.test",
  employeeId: "1",
  roles: ["ADMINISTRADOR_SISTEMA"],
  permissions: ["EMPLEADOS_PERFILES_ADMINISTRAR"],
  scope: { role: "ADMINISTRADOR_SISTEMA", modules: ["personnel"] },
};

/**
 * A user with module `personnel` but without `EMPLEADOS_PERFILES_ADMINISTRAR`.
 *
 * The API derives module `personnel` from that single permission
 * (`PERMISSION_TO_MODULE`), so this combination is not producible by the real
 * backend today. It is used here to pin the frontend gate on its own: the route
 * guard checks the module, the mutation controls check the permission.
 */
const VIEWER: User = {
  ...MANAGER,
  roles: ["OPERADOR_ESTACION"],
  permissions: ["PERFIL_PROPIO_CONSULTAR"],
};

// ── Fake backend ─────────────────────────────────────────────────────────────

interface ApiState {
  empleados: Empleado[];
  /** Message returned as a 409 from POST; null makes the POST succeed. */
  createConflict: string | null;
  /** Message returned as a 409 from DELETE; null makes the DELETE succeed. */
  deleteConflict: string | null;
  /** Every handled call as `METHOD /path?query`, for query-string assertions. */
  calls: string[];
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};

function conflictBody(message: string) {
  return { statusCode: 409, message, error: "Conflict" };
}

/** Case-insensitive match on name, email or DPI — mirrors the API `search`. */
function matchesSearch(empleado: Empleado, search: string): boolean {
  const needle = search.trim().toLowerCase();
  return (
    empleado.name.toLowerCase().includes(needle) ||
    empleado.email.toLowerCase().includes(needle) ||
    (empleado.dpi ?? "").toLowerCase().includes(needle)
  );
}

/** Builds the stored row for a POST body, inlining the role like the API does. */
function toCreateEmpleado(payload: Record<string, unknown>, id: string): Empleado {
  const roleId = String(payload.roleId ?? "");
  const role = ROLES.find((candidate) => candidate.id === roleId);
  const text = (value: unknown) => (typeof value === "string" && value ? value : null);
  return {
    id,
    name: String(payload.name ?? ""),
    email: String(payload.email ?? ""),
    status: (payload.status as Empleado["status"]) ?? "ACTIVO",
    roleId,
    roleCode: role?.code ?? "",
    roleName: role?.name ?? "",
    phone: text(payload.phone),
    dpi: text(payload.dpi),
    hireDate: text(payload.hireDate),
    address: text(payload.address),
    licenseNumber: text(payload.licenseNumber),
    educationHistory: text(payload.educationHistory),
    languages: text(payload.languages),
  };
}

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Fulfills /personal/* from an in-memory roster, recording every call. */
async function mockPersonalApi(page: Page, overrides: Partial<ApiState> = {}) {
  const state: ApiState = {
    empleados: seedEmpleados(),
    createConflict: null,
    deleteConflict: null,
    calls: [],
    ...overrides,
  };

  await page.route(
    (url) => url.hostname === "localhost" && url.pathname.startsWith("/personal/"),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const path = url.pathname;

      // CORS preflight: the API client sends Content-Type + Authorization.
      if (method === "OPTIONS") {
        await route.fulfill({ status: 204, headers: CORS_HEADERS, body: "" });
        return;
      }

      state.calls.push(`${method} ${path}${url.search}`);

      if (path === "/personal/roles" && method === "GET") {
        await fulfillJson(route, 200, ROLES);
        return;
      }

      if (path === "/personal/empleados" && method === "GET") {
        const search = url.searchParams.get("search") ?? "";
        const status = url.searchParams.get("status");
        const roleId = url.searchParams.get("roleId");
        const rows = state.empleados.filter((empleado) => {
          if (search && !matchesSearch(empleado, search)) return false;
          if (status && empleado.status !== status) return false;
          if (roleId && empleado.roleId !== roleId) return false;
          return true;
        });
        await fulfillJson(route, 200, rows);
        return;
      }

      if (path === "/personal/empleados" && method === "POST") {
        if (state.createConflict) {
          await fulfillJson(route, 409, conflictBody(state.createConflict));
          return;
        }
        const payload = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
        const created = toCreateEmpleado(payload, String(state.empleados.length + 100));
        state.empleados = [...state.empleados, created];
        await fulfillJson(route, 201, created);
        return;
      }

      const detail = /^\/personal\/empleados\/([^/]+)$/.exec(path);
      if (detail) {
        const id = decodeURIComponent(detail[1]);
        const index = state.empleados.findIndex((empleado) => empleado.id === id);
        if (index === -1) {
          await fulfillJson(route, 404, {
            statusCode: 404,
            message: "El empleado no existe o fue eliminado.",
            error: "Not Found",
          });
          return;
        }

        if (method === "PATCH") {
          const payload = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
          const current = state.empleados[index];
          const updated: Empleado = { ...current };
          for (const [key, value] of Object.entries(payload)) {
            if (key === "roleId") {
              const role = ROLES.find((r) => r.id === String(value));
              updated.roleId = String(value);
              if (role) {
                updated.roleCode = role.code;
                updated.roleName = role.name;
              }
              continue;
            }
            (updated as unknown as Record<string, unknown>)[key] = value;
          }
          state.empleados = state.empleados.map((e, i) => (i === index ? updated : e));
          await fulfillJson(route, 200, updated);
          return;
        }

        if (method === "DELETE") {
          if (state.deleteConflict) {
            await fulfillJson(route, 409, conflictBody(state.deleteConflict));
            return;
          }
          state.empleados = state.empleados.filter((empleado) => empleado.id !== id);
          await route.fulfill({ status: 204, headers: CORS_HEADERS, body: "" });
          return;
        }
      }

      await fulfillJson(route, 404, {
        statusCode: 404,
        message: `Unhandled mock: ${method} ${path}`,
        error: "Not Found",
      });
    },
  );

  return state;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Seeds the AuthProvider localStorage contract before any app script runs. */
async function signIn(page: Page, user: User) {
  await page.addInitScript(
    ([token, userJson]) => {
      window.localStorage.setItem("transmetro_token", token);
      window.localStorage.setItem("transmetro_user", userJson);
    },
    ["e2e-token", JSON.stringify(user)] as const,
  );
}

async function openPersonalPage(page: Page, user: User) {
  await signIn(page, user);
  await page.goto(PERSONAL_PAGE);
}

function row(page: Page, name: string) {
  return page.getByRole("row", { name: new RegExp(name) });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("Personal page E2E", () => {
  test.beforeEach(async ({ page }) => {
    // External CDNs/fonts are not needed for any assertion; blocking them keeps
    // the suite hermetic and fast.
    await page.route(
      (url) => url.hostname !== "127.0.0.1" && url.hostname !== "localhost",
      (route) => route.abort(),
    );
  });

  test("PERSONAL-E2E-001 reaches /personal and lists employees and roles", async ({ page }) => {
    const api = await mockPersonalApi(page);
    await openPersonalPage(page, MANAGER);

    await expect(page).toHaveURL(new RegExp(`${PERSONAL_PAGE}$`));
    await expect(page.getByRole("heading", { name: "Personal (2)" })).toBeVisible();
    await expect(row(page, "Ana López")).toBeVisible();
    await expect(row(page, "Carlos Ruiz")).toBeVisible();
    await expect(row(page, "Ana López")).toContainText("Piloto");
    await expect(row(page, "Ana López")).toContainText("05/03/2024");

    // Roles come from GET /personal/roles and populate the role filter.
    const roleFilter = page.getByLabel("Filtrar por rol");
    await expect(roleFilter).toBeEnabled();
    await expect(roleFilter.locator("option")).toHaveText([
      "Todos los roles",
      "Administrador del Sistema",
      "Piloto",
    ]);

    await expect.poll(() => api.calls).toContain("GET /personal/empleados");
    await expect.poll(() => api.calls).toContain("GET /personal/roles");
  });

  test("PERSONAL-E2E-002 sends the search term as a ?search= query param", async ({ page }) => {
    const api = await mockPersonalApi(page);
    await openPersonalPage(page, MANAGER);
    await expect(row(page, "Ana López")).toBeVisible();

    // Web-first: the assertion retries until the debounced request is recorded,
    // so the suite never sleeps for the 300ms debounce window.
    await page.getByLabel("Buscar empleados").fill("ana");

    await expect.poll(() => api.calls).toContain("GET /personal/empleados?search=ana");
    await expect(row(page, "Ana López")).toBeVisible();
    await expect(row(page, "Carlos Ruiz")).toHaveCount(0);
  });

  test("PERSONAL-E2E-003 creates an employee and shows it after the list refetch", async ({ page }) => {
    const api = await mockPersonalApi(page);
    await openPersonalPage(page, MANAGER);
    await expect(page.getByRole("heading", { name: "Personal (2)" })).toBeVisible();

    await page.getByRole("button", { name: "Nuevo empleado" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Nuevo empleado" })).toBeVisible();

    await dialog.getByLabel("Nombre *").fill("María Gómez");
    await dialog.getByLabel("Correo *").fill("maria@transmetro.test");
    await dialog.getByLabel("Rol *").selectOption("1");
    await dialog.getByLabel("DPI *").fill("5555555555555");
    await dialog.getByRole("button", { name: "Guardar" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Personal (3)" })).toBeVisible();
    await expect(row(page, "María Gómez")).toBeVisible();
    await expect(row(page, "María Gómez")).toContainText("Administrador del Sistema");

    await expect.poll(() => api.calls).toContain("POST /personal/empleados");
  });

  test("PERSONAL-E2E-004 keeps the dialog open and shows the message on a 409 create", async ({
    page,
  }) => {
    const conflict = "Ya existe un empleado con el correo maria@transmetro.test";
    const api = await mockPersonalApi(page, { createConflict: conflict });
    await openPersonalPage(page, MANAGER);
    await expect(row(page, "Ana López")).toBeVisible();

    await page.getByRole("button", { name: "Nuevo empleado" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre *").fill("María Gómez");
    await dialog.getByLabel("Correo *").fill("maria@transmetro.test");
    await dialog.getByLabel("Rol *").selectOption("1");
    await dialog.getByLabel("DPI *").fill("5555555555555");
    await dialog.getByRole("button", { name: "Guardar" }).click();

    await expect(dialog.getByRole("alert")).toHaveText(conflict);
    await expect(dialog).toBeVisible();
    // The failed mutation must not have refetched or added the row.
    await expect(page.getByRole("heading", { name: "Personal (2)" })).toBeVisible();
    await expect(row(page, "María Gómez")).toHaveCount(0);
    await expect.poll(() => api.calls).toContain("POST /personal/empleados");
  });

  test("PERSONAL-E2E-005 deletes an employee through the confirm dialog", async ({ page }) => {
    const api = await mockPersonalApi(page);
    await openPersonalPage(page, MANAGER);
    await expect(row(page, "Ana López")).toBeVisible();

    await page.getByRole("button", { name: "Eliminar Ana López" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("heading", { name: "Eliminar empleado" })).toBeVisible();
    // The shortcut is only offered once a delete has actually failed.
    await expect(dialog.getByRole("button", { name: "Desactivar en su lugar" })).toHaveCount(0);

    await dialog.getByRole("button", { name: "Eliminar", exact: true }).click();

    await expect(dialog).toHaveCount(0);
    await expect(row(page, "Ana López")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Personal (1)" })).toBeVisible();
    await expect.poll(() => api.calls).toContain("DELETE /personal/empleados/10");
  });

  test("PERSONAL-E2E-006 offers deactivation when the delete returns 409", async ({ page }) => {
    const conflict =
      'No se puede eliminar el empleado porque tiene historial asociado; desactívelo en su lugar (PATCH con status "INACTIVO")';
    const api = await mockPersonalApi(page, { deleteConflict: conflict });
    await openPersonalPage(page, MANAGER);
    await expect(row(page, "Ana López")).toBeVisible();

    await page.getByRole("button", { name: "Eliminar Ana López" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Eliminar", exact: true }).click();

    await expect(dialog.getByRole("alert")).toHaveText(conflict);
    await expect(dialog).toBeVisible();
    await expect(row(page, "Ana López")).toHaveCount(1);
    await expect.poll(() => api.calls).toContain("DELETE /personal/empleados/10");

    await dialog.getByRole("button", { name: "Desactivar en su lugar" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(row(page, "Ana López")).toContainText("Inactivo");
    await expect.poll(() => api.calls).toContain("PATCH /personal/empleados/10");
  });

  test("PERSONAL-E2E-007 hides every mutation control without the permission", async ({ page }) => {
    await mockPersonalApi(page);
    await openPersonalPage(page, VIEWER);

    await expect(page.getByRole("heading", { name: "Personal (2)" })).toBeVisible();
    await expect(row(page, "Ana López")).toBeVisible();
    await expect(row(page, "Carlos Ruiz")).toBeVisible();

    await expect(page.getByRole("button", { name: "Nuevo empleado" })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Acciones" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Editar / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Eliminar / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Desactivar|Activar) / })).toHaveCount(0);
  });
});