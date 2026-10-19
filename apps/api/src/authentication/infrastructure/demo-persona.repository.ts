import { Inject } from "@nestjs/common";

import type { DemoPersona } from "../authentication.contracts.js";
import { DATASOURCE } from "./google-credential-verifier.port.js";

export type { DemoPersona };

interface SqlQueryExecutor {
  query(statement: string, parameters?: (number | string)[]): Promise<unknown>;
}

// Picks one representative ACTIVE employee per ACTIVE role for the demo role
// switch. Employees with an operational assignment (a pilot with a unit, a
// station operator with an ACTIVE station) win, so role-scoped screens such
// as "my unit" / "my station" have data to show; ties break by lowest id.
export class DemoPersonaRepository {
  constructor(
    @Inject(DATASOURCE)
    private readonly queryExecutor: SqlQueryExecutor,
  ) {}

  async findRepresentatives(): Promise<DemoPersona[]> {
    const rows = await this.queryExecutor.query(
      `SELECT DISTINCT ON (role.id_rol)
              role.codigo AS "roleCode",
              role.nombre_rol AS "roleName",
              employee.id_emple::text AS "employeeId",
              employee.nombre_emple AS "employeeName"
       FROM tbl_rol AS role
       INNER JOIN tbl_empleado AS employee ON employee.id_rol = role.id_rol
       WHERE role.activo = true
         AND employee.estado_emple = $1
       ORDER BY role.id_rol,
                (EXISTS (SELECT 1 FROM tbl_asignacion_piloto AS pilot
                         WHERE pilot.id_empleado = employee.id_emple)
                 OR EXISTS (SELECT 1 FROM tbl_asignacion_estacion AS station
                            WHERE station.id_empleado = employee.id_emple
                              AND station.estado_asignacion = $2)) DESC,
                employee.id_emple`,
      ["ACTIVO", "ACTIVA"],
    );

    return rows as DemoPersona[];
  }
}
