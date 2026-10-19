// Demo role switcher: lets an allowlisted reviewer act as each role from the
// landing page header. Hidden whenever the API reports the feature as
// unavailable (disabled -> 404, not allowlisted -> 403).

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../../features/authentication/auth-context";
import { LandingPage } from "../../features/authentication/landing-page";
import { userFromToken } from "../../features/authentication/token-user";

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fakeJwt(payload: Record<string, unknown>): string {
  return `${base64Url(JSON.stringify({ alg: "HS256" }))}.${base64Url(JSON.stringify(payload))}.sig`;
}

const REVIEWER = {
  employeeId: "100",
  email: "REVIEWER@GMAIL.COM",
  roles: ["Administrador del sistema"],
  permissions: ["EMPLEADOS_PERFILES_ADMINISTRAR"],
  scope: { role: "Administrador del sistema", modules: ["personnel"] },
};

const PILOT_TOKEN = fakeJwt({
  employeeId: "61",
  email: "PILOT@TRANSMETRO.DEMO",
  roles: ["Piloto"],
  permissions: ["UNIDAD_ASIGNADA_CONSULTAR"],
  scope: { role: "Piloto", modules: ["fleet"] },
  demoActor: { employeeId: "100", email: "REVIEWER@GMAIL.COM" },
});

const PERSONAS = [
  { roleCode: "PILOTO", roleName: "Piloto", employeeId: "61", employeeName: "Demo Piloto" },
  { roleCode: "OPERADOR_ESTACION", roleName: "Operador de estación", employeeId: "62", employeeName: "Demo Operador" },
];

function seedSession(user: object) {
  localStorage.setItem("transmetro_token", "current-token");
  localStorage.setItem("transmetro_user", JSON.stringify(user));
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderLanding() {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <LandingPage />
      </AuthProvider>
    </BrowserRouter>,
  );
}

describe("DemoRoleSwitcher", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when the API reports the feature unavailable", async () => {
    seedSession(REVIEWER);
    fetchMock.mockResolvedValue(jsonResponse(404, { message: "Not Found" }));

    renderLanding();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByLabelText("Ver como")).not.toBeInTheDocument();
  });

  it("switches to the selected role and stores the persona session", async () => {
    seedSession(REVIEWER);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/authentication/demo/personas")) {
        return jsonResponse(200, {
          actorEmail: REVIEWER.email,
          impersonating: false,
          activeEmployeeId: "100",
          personas: PERSONAS,
        });
      }
      if (url.endsWith("/authentication/demo/switch")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ roleCode: "PILOTO" });
        return jsonResponse(200, { token: PILOT_TOKEN });
      }
      throw new Error(`unexpected ${url}`);
    });

    renderLanding();

    const select = await screen.findByLabelText("Ver como");
    expect(screen.getByRole("option", { name: "Piloto (Demo Piloto)" })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "PILOTO" } });

    await waitFor(() => expect(localStorage.getItem("transmetro_token")).toBe(PILOT_TOKEN));
    expect(JSON.parse(localStorage.getItem("transmetro_user")!).employeeId).toBe("61");
    expect(await screen.findByText("Flota")).toBeInTheDocument();
  });

  it("offers a way back to the reviewer's own account while impersonating", async () => {
    seedSession(userFromToken(PILOT_TOKEN));
    const reviewerToken = fakeJwt(REVIEWER);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/authentication/demo/personas")) {
        return jsonResponse(200, {
          actorEmail: REVIEWER.email,
          impersonating: true,
          activeEmployeeId: "61",
          personas: PERSONAS,
        });
      }
      if (url.endsWith("/authentication/demo/restore")) {
        return jsonResponse(200, { token: reviewerToken });
      }
      throw new Error(`unexpected ${url}`);
    });

    renderLanding();

    expect(await screen.findByText(/Modo demo/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver a mi cuenta" }));

    await waitFor(() => expect(localStorage.getItem("transmetro_token")).toBe(reviewerToken));
    expect(await screen.findByText("Personal")).toBeInTheDocument();
  });
});

describe("userFromToken", () => {
  it("decodes base64url payloads with non-ASCII role names", () => {
    const token = fakeJwt({ ...REVIEWER, roles: ["Operador de estación"] });

    expect(userFromToken(token).roles).toEqual(["Operador de estación"]);
  });
});
