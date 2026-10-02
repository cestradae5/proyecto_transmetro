// E2E HTTP test for GET /fleet/pilots (task B2, fleet-frontend-operator).
//
// Same real-app-boot convention as asignacion-piloto.e2e-spec.ts: full
// AppModule against real Postgres. `npm run test:e2e` hardcodes
// DATABASE_NAME=transmetro_test, so the development database is never
// touched. Requires apps/api/.env exported into the shell (jest-e2e.json has
// no dotenv setup).

process.env.ADMIN_WEB_ORIGINS ??= "https://admin.transmetro.gt";
process.env.GOOGLE_WEB_CLIENT_ID ??= "test-client-id";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import jwt from "jsonwebtoken";
import request from "supertest";
import { DataSource } from "typeorm";

import { AppModule } from "../src/app.module.js";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-in-production";
const FLOTA_GESTIONAR = "FLOTA_GESTIONAR";
const OPERATOR_ROLE_CODE = "OPERADOR_CENTRAL";
const PILOT_ROLE_CODE = "PILOTO";

interface PilotItem {
  idEmpleado: string;
  nombre: string;
  idUnidad?: string;
}

function signToken(employeeId: string, roleCode: string, permissions: string[]): string {
  return jwt.sign(
    {
      employeeId,
      email: `e2e-piloto-list-${employeeId}@transmetro.gt`,
      roles: [roleCode],
      permissions,
      scope: { role: roleCode, modules: ["passengers"] },
    },
    JWT_SECRET,
    { expiresIn: "12h" },
  );
}

describe("GET /fleet/pilots (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let operatorToken: string;
  let pilotRoleId: string;
  let operatorRoleId: string;
  const createdUnitIds: string[] = [];
  const createdEmployeeIds: string[] = [];
  const runTag = `E2E-LIST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function createEmployee(
    label: string,
    status: "ACTIVO" | "INACTIVO",
    roleId: string,
  ): Promise<{ id: string; name: string }> {
    const name = `${runTag} ${label}`;
    const rows = (await dataSource.query(
      `INSERT INTO tbl_empleado (nombre_emple, estado_emple, correo_emple, id_rol)
       VALUES ($1, $2, $3, $4)
       RETURNING id_emple AS "idEmple"`,
      [
        name,
        status,
        `e2e-piloto-list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@transmetro.gt`,
        roleId,
      ],
    )) as { idEmple: string }[];
    const id = rows[0]!.idEmple;
    createdEmployeeIds.push(id);
    return { id, name };
  }

  async function createUnit(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post("/fleet/units")
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({
        numeroPlaca: `E2E-PL-${Math.random().toString(36).slice(2, 10)}`,
        marca: "Volvo",
        modelo: "B440",
        anio: 2024,
        capacidadPasajeros: 50,
      })
      .expect(201);
    const unitId = response.body.idUnidad as string;
    createdUnitIds.push(unitId);
    return unitId;
  }

  async function getPilots(): Promise<PilotItem[]> {
    const response = await request(app.getHttpServer())
      .get("/fleet/pilots")
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(200);
    return response.body as PilotItem[];
  }

  async function roleId(code: string): Promise<string> {
    const rows = (await dataSource.query(`SELECT id_rol AS "idRol" FROM tbl_rol WHERE codigo = $1`, [
      code,
    ])) as { idRol: string }[];
    if (!rows[0]) {
      throw new Error(`Seed role ${code} not found in tbl_rol`);
    }
    return rows[0].idRol;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);

    operatorRoleId = await roleId(OPERATOR_ROLE_CODE);
    pilotRoleId = await roleId(PILOT_ROLE_CODE);

    const operator = await createEmployee("Operator", "ACTIVO", operatorRoleId);
    operatorToken = signToken(operator.id, OPERATOR_ROLE_CODE, [FLOTA_GESTIONAR]);
  });

  afterAll(async () => {
    if (createdUnitIds.length > 0) {
      await dataSource.query(`DELETE FROM tbl_bitacora WHERE entidad_id = ANY($1::bigint[])`, [
        createdUnitIds,
      ]);
      await dataSource.query(
        `DELETE FROM tbl_asignacion_piloto WHERE id_unidad = ANY($1::bigint[])`,
        [createdUnitIds],
      );
      await dataSource.query(
        `DELETE FROM tbl_asignacion_unidad WHERE id_unidad = ANY($1::bigint[])`,
        [createdUnitIds],
      );
      await dataSource.query(`DELETE FROM tbl_unidad WHERE id_unidad = ANY($1::bigint[])`, [
        createdUnitIds,
      ]);
    }
    if (createdEmployeeIds.length > 0) {
      await dataSource.query(
        `DELETE FROM tbl_asignacion_piloto WHERE id_empleado = ANY($1::bigint[])`,
        [createdEmployeeIds],
      );
      await dataSource.query(`DELETE FROM tbl_empleado WHERE id_emple = ANY($1::bigint[])`, [
        createdEmployeeIds,
      ]);
    }
    await app.close();
  });

  it("returns 401 without a token", async () => {
    await request(app.getHttpServer()).get("/fleet/pilots").expect(401);
  });

  it("returns 403 when the token lacks FLOTA_GESTIONAR", async () => {
    const token = signToken("1", OPERATOR_ROLE_CODE, []);
    await request(app.getHttpServer())
      .get("/fleet/pilots")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("returns active pilots with {idEmpleado, nombre}, idUnidad only when assigned, and excludes inactive/non-pilot employees", async () => {
    const assigned = await createEmployee("Assigned Pilot", "ACTIVO", pilotRoleId);
    const unassigned = await createEmployee("Unassigned Pilot", "ACTIVO", pilotRoleId);
    const inactive = await createEmployee("Inactive Pilot", "INACTIVO", pilotRoleId);
    const nonPilot = await createEmployee("Non Pilot", "ACTIVO", operatorRoleId);
    const unitId = await createUnit();

    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/pilot-assignment`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ idEmpleado: assigned.id })
      .expect(201);

    const pilots = await getPilots();
    const byId = new Map(pilots.map((p) => [p.idEmpleado, p]));

    const assignedItem = byId.get(assigned.id);
    expect(assignedItem).toEqual({
      idEmpleado: assigned.id,
      nombre: assigned.name,
      idUnidad: unitId,
    });

    const unassignedItem = byId.get(unassigned.id);
    expect(unassignedItem).toEqual({ idEmpleado: unassigned.id, nombre: unassigned.name });
    expect(unassignedItem).not.toHaveProperty("idUnidad");

    expect(byId.has(inactive.id)).toBe(false);
    expect(byId.has(nonPilot.id)).toBe(false);

    // No leaked fields (email, role, status...) on any item.
    for (const item of pilots) {
      for (const key of Object.keys(item)) {
        expect(["idEmpleado", "nombre", "idUnidad"]).toContain(key);
      }
    }
    expect(JSON.stringify(pilots)).not.toContain("@transmetro.gt");
  });
});
