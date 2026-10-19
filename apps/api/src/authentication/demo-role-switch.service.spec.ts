// Demo role switch: lets an allowlisted reviewer (e.g. a teacher evaluating
// the academic project) act as a representative employee of each role
// without needing one Google account per role. Off unless explicitly enabled.

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import jwt from "jsonwebtoken";

import { AuthenticationService } from "./authentication.service.js";
import {
  DemoPersonaNotFound,
  DemoRoleSwitchDisabled,
  DemoRoleSwitchForbidden,
  type MeResult,
} from "./authentication.contracts.js";
import { DemoRoleSwitchService, type DemoRoleSwitchConfig } from "./demo-role-switch.service.js";
import type { DemoPersona } from "./infrastructure/demo-persona.repository.js";
import { DemoRoleSwitchController } from "./demo-role-switch.controller.js";
import { readDemoRoleSwitchEnvironment } from "../platform/configuration/environment.js";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-in-production";

interface FakeEmployee {
  id: string;
  email: string;
  name: string;
  role: { name: string; code: string; permissions: { code: string }[] };
}

const REVIEWER: FakeEmployee = {
  id: "100",
  email: "REVIEWER@GMAIL.COM",
  name: "Docente",
  role: {
    name: "Administrador del sistema",
    code: "ADMINISTRADOR_SISTEMA",
    permissions: [{ code: "EMPLEADOS_PERFILES_ADMINISTRAR" }, { code: "PERFIL_PROPIO_CONSULTAR" }],
  },
};

const PILOT: FakeEmployee = {
  id: "61",
  email: "PILOT@TRANSMETRO.DEMO",
  name: "Demo Piloto",
  role: {
    name: "Piloto",
    code: "PILOTO",
    permissions: [{ code: "UNIDAD_ASIGNADA_CONSULTAR" }, { code: "PERFIL_PROPIO_CONSULTAR" }],
  },
};

const ADMIN: FakeEmployee = {
  id: "1",
  email: "ADMIN@TRANSMETRO.GT",
  name: "admin",
  role: REVIEWER.role,
};

const OUTSIDER: FakeEmployee = {
  id: "7",
  email: "OUTSIDER@TRANSMETRO.GT",
  name: "Outsider",
  role: REVIEWER.role,
};

const PERSONAS: DemoPersona[] = [
  { roleCode: "PILOTO", roleName: "Piloto", employeeId: "61", employeeName: "Demo Piloto" },
  {
    roleCode: "ADMINISTRADOR_SISTEMA",
    roleName: "Administrador del sistema",
    employeeId: "1",
    employeeName: "admin",
  },
  // Listed by the query but missing from the eligible store (became inactive).
  { roleCode: "GUARDIA", roleName: "Guardia", employeeId: "55", employeeName: "Demo Guardia" },
];

const ENABLED: DemoRoleSwitchConfig = { enabled: true, allowedEmails: ["reviewer@gmail.com"] };

function meOf(employee: FakeEmployee, demoActor?: { employeeId: string; email: string }): MeResult {
  return {
    employeeId: employee.id,
    email: employee.email,
    roles: [employee.role.name],
    permissions: employee.role.permissions.map((p) => p.code),
    scope: { role: employee.role.name, modules: [] },
    ...(demoActor ? { demoActor } : {}),
  };
}

function makeService(config: DemoRoleSwitchConfig = ENABLED) {
  const employees = new Map([REVIEWER, PILOT, ADMIN, OUTSIDER].map((e) => [e.id, e]));
  const audits: Record<string, unknown>[] = [];
  const dataSource = { transaction: async (cb: (m: unknown) => unknown) => cb({}) };
  const employeeRepo = {
    findEligibleById: async (_m: unknown, id: string) => employees.get(id) ?? null,
  };
  const auditRepo = {
    create: async (_m: unknown, record: Record<string, unknown>) => {
      audits.push(record);
      return record;
    },
  };
  const personaRepo = { findRepresentatives: async () => PERSONAS };

  const service = new DemoRoleSwitchService(
    dataSource as never,
    employeeRepo as never,
    auditRepo as never,
    personaRepo as never,
    config,
  );
  return { service, audits };
}

function decode(token: string): Record<string, any> {
  return jwt.verify(token, JWT_SECRET) as Record<string, any>;
}

describe("DemoRoleSwitchService", () => {
  describe("access control", () => {
    it("rejects every operation when the feature is disabled", async () => {
      const { service, audits } = makeService({ enabled: false, allowedEmails: ["reviewer@gmail.com"] });

      await expect(service.listPersonas(meOf(REVIEWER))).rejects.toThrow(DemoRoleSwitchDisabled);
      await expect(service.switchTo(meOf(REVIEWER), "PILOTO")).rejects.toThrow(DemoRoleSwitchDisabled);
      await expect(service.restore(meOf(REVIEWER))).rejects.toThrow(DemoRoleSwitchDisabled);
      expect(audits).toHaveLength(0);
    });

    it("treats an enabled flag with an empty allowlist as disabled (fail closed)", async () => {
      const { service } = makeService({ enabled: true, allowedEmails: [] });

      await expect(service.listPersonas(meOf(REVIEWER))).rejects.toThrow(DemoRoleSwitchDisabled);
    });

    it("forbids employees whose email is not allowlisted, without auditing a switch", async () => {
      const { service, audits } = makeService();

      await expect(service.listPersonas(meOf(OUTSIDER))).rejects.toThrow(DemoRoleSwitchForbidden);
      await expect(service.switchTo(meOf(OUTSIDER), "PILOTO")).rejects.toThrow(DemoRoleSwitchForbidden);
      await expect(service.restore(meOf(OUTSIDER))).rejects.toThrow(DemoRoleSwitchForbidden);
      expect(audits).toHaveLength(0);
    });

    it("matches the allowlist case-insensitively", async () => {
      const { service } = makeService({ enabled: true, allowedEmails: ["Reviewer@Gmail.com"] });

      await expect(service.listPersonas(meOf(REVIEWER))).resolves.toBeDefined();
    });

    it("authorizes an impersonated session by the original actor, not the persona", async () => {
      const { service } = makeService();

      // Persona email is not allowlisted, but the signed demoActor is.
      const impersonating = meOf(PILOT, { employeeId: REVIEWER.id, email: REVIEWER.email });
      await expect(service.listPersonas(impersonating)).resolves.toBeDefined();

      // A persona session without a demoActor claim gets no switch rights.
      await expect(service.listPersonas(meOf(PILOT))).rejects.toThrow(DemoRoleSwitchForbidden);
    });
  });

  describe("listPersonas", () => {
    it("lists one representative per role, excluding the actor's own role", async () => {
      const { service } = makeService();

      const result = await service.listPersonas(meOf(REVIEWER));

      expect(result).toEqual({
        actorEmail: REVIEWER.email,
        impersonating: false,
        activeEmployeeId: REVIEWER.id,
        personas: [PERSONAS[0], PERSONAS[2]],
      });
    });

    it("reports the active persona while impersonating", async () => {
      const { service } = makeService();

      const result = await service.listPersonas(
        meOf(PILOT, { employeeId: REVIEWER.id, email: REVIEWER.email }),
      );

      expect(result.impersonating).toBe(true);
      expect(result.activeEmployeeId).toBe(PILOT.id);
      expect(result.actorEmail).toBe(REVIEWER.email);
    });
  });

  describe("switchTo", () => {
    it("issues a JWT for the persona employee carrying the original actor, and audits it", async () => {
      const { service, audits } = makeService();

      const result = await service.switchTo(meOf(REVIEWER), "PILOTO");
      const payload = decode(result.token);

      expect(payload.employeeId).toBe(PILOT.id);
      expect(payload.email).toBe(PILOT.email);
      expect(payload.roles).toEqual(["Piloto"]);
      expect(payload.permissions).toEqual(["UNIDAD_ASIGNADA_CONSULTAR", "PERFIL_PROPIO_CONSULTAR"]);
      expect(payload.demoActor).toEqual({ employeeId: REVIEWER.id, email: REVIEWER.email });
      expect(result.usuario.demoActor).toEqual({ employeeId: REVIEWER.id, email: REVIEWER.email });

      expect(audits).toEqual([
        expect.objectContaining({
          action: "DEMO_ROLE_SWITCH",
          employee: REVIEWER,
          entityId: PILOT.id,
          entityType: "employee",
          module: "authentication",
          result: "EXITOSO",
          detalle: { roleCode: "PILOTO", targetEmployeeId: PILOT.id },
        }),
      ]);
    });

    it("keeps the original actor when switching again from an impersonated session", async () => {
      const { service } = makeService();

      const result = await service.switchTo(
        meOf(PILOT, { employeeId: REVIEWER.id, email: REVIEWER.email }),
        "ADMINISTRADOR_SISTEMA",
      );
      const payload = decode(result.token);

      expect(payload.employeeId).toBe(ADMIN.id);
      expect(payload.demoActor).toEqual({ employeeId: REVIEWER.id, email: REVIEWER.email });
    });

    it("rejects a persona that is no longer eligible (inactive) without auditing", async () => {
      const { service, audits } = makeService();

      await expect(service.switchTo(meOf(REVIEWER), "GUARDIA")).rejects.toThrow(DemoPersonaNotFound);
      expect(audits).toHaveLength(0);
    });

    it("rejects the switch when the original actor is no longer eligible", async () => {
      const { service, audits } = makeService();
      const ghostActor = { employeeId: "999", email: REVIEWER.email };

      await expect(service.switchTo(meOf(PILOT, ghostActor), "PILOTO")).rejects.toThrow(
        DemoRoleSwitchForbidden,
      );
      expect(audits).toHaveLength(0);
    });

    it("rejects an unknown role code without auditing", async () => {
      const { service, audits } = makeService();

      await expect(service.switchTo(meOf(REVIEWER), "NOPE")).rejects.toThrow(DemoPersonaNotFound);
      expect(audits).toHaveLength(0);
    });
  });

  describe("restore", () => {
    it("issues a plain JWT for the original actor without a demoActor claim", async () => {
      const { service, audits } = makeService();

      const result = await service.restore(meOf(PILOT, { employeeId: REVIEWER.id, email: REVIEWER.email }));
      const payload = decode(result.token);

      expect(payload.employeeId).toBe(REVIEWER.id);
      expect(payload.demoActor).toBeUndefined();
      expect(result.usuario.demoActor).toBeUndefined();
      expect(audits).toEqual([
        expect.objectContaining({ action: "DEMO_ROLE_RESTORE", employee: REVIEWER, entityId: REVIEWER.id }),
      ]);
    });
  });
});

describe("AuthenticationService.verifyToken with demo claims", () => {
  const service = new AuthenticationService({} as never, {} as never, {} as never, {} as never);

  it("passes the signed demoActor claim through to the request user", async () => {
    const token = jwt.sign(
      {
        employeeId: "61",
        email: "PILOT@TRANSMETRO.DEMO",
        roles: ["Piloto"],
        permissions: ["PERFIL_PROPIO_CONSULTAR"],
        scope: { role: "Piloto", modules: [] },
        demoActor: { employeeId: "100", email: "REVIEWER@GMAIL.COM" },
      },
      JWT_SECRET,
    );

    const result = await service.verifyToken(token);

    expect(result.demoActor).toEqual({ employeeId: "100", email: "REVIEWER@GMAIL.COM" });
  });

  it("omits demoActor for a regular token (previous behavior)", async () => {
    const token = jwt.sign(
      {
        employeeId: "1",
        email: "ADMIN@TRANSMETRO.GT",
        roles: ["Administrador del sistema"],
        permissions: [],
        scope: { role: "Administrador del sistema", modules: [] },
      },
      JWT_SECRET,
    );

    const result = await service.verifyToken(token);

    expect(result).not.toHaveProperty("demoActor");
  });
});

describe("readDemoRoleSwitchEnvironment", () => {
  it("is disabled by default", () => {
    expect(readDemoRoleSwitchEnvironment({})).toEqual({ enabled: false, allowedEmails: [] });
  });

  it("parses the flag and a comma-separated, normalized allowlist", () => {
    expect(
      readDemoRoleSwitchEnvironment({
        DEMO_ROLE_SWITCH_ENABLED: "TRUE",
        DEMO_ROLE_SWITCH_EMAILS: " Reviewer@Gmail.com , ,other@x.gt",
      }),
    ).toEqual({ enabled: true, allowedEmails: ["reviewer@gmail.com", "other@x.gt"] });
  });
});

describe("DemoRoleSwitchController error mapping", () => {
  function controllerFailingWith(error: Error) {
    const failing = async () => {
      throw error;
    };
    return new DemoRoleSwitchController({
      listPersonas: failing,
      switchTo: failing,
      restore: failing,
    } as never);
  }
  const request = { user: meOf(REVIEWER) };

  it("hides the feature with 404 while disabled", async () => {
    await expect(controllerFailingWith(new DemoRoleSwitchDisabled()).personas(request)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("answers 403 for accounts outside the allowlist", async () => {
    await expect(
      controllerFailingWith(new DemoRoleSwitchForbidden()).switch(request, { roleCode: "PILOTO" }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("answers 404 when no persona exists for the role", async () => {
    await expect(controllerFailingWith(new DemoPersonaNotFound()).restore(request)).rejects.toThrow(
      NotFoundException,
    );
  });
});
