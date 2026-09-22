import { Inject } from "@nestjs/common";

import { DATASOURCE } from "./google-credential-verifier.port.js";

const ASSIGNMENT_STATES = {
  ACTIVE: "ACTIVA",
} as const;

interface AssignmentScopeRow {
  id: string;
}

interface SqlQueryExecutor {
  query(statement: string, parameters?: (number | string)[]): Promise<unknown>;
}

export interface AssignmentScope {
  lineIds: string[];
  stationIds: string[];
  unitIds: string[];
}

export class AssignmentScopeRepository {
  constructor(
    @Inject(DATASOURCE)
    private readonly queryExecutor: SqlQueryExecutor,
  ) {}

  async findByEmployeeId(employeeId: string): Promise<AssignmentScope> {
    const [stationIds, lineIds, unitIds] = await Promise.all([
      this.findIds(
        `SELECT DISTINCT assignment.id_estacion AS "id"
         FROM tbl_asignacion_estacion AS assignment
         WHERE assignment.id_empleado = $1
           AND assignment.estado_asignacion = $2
         ORDER BY assignment.id_estacion`,
        [employeeId, ASSIGNMENT_STATES.ACTIVE],
      ),
      this.findIds(
        `SELECT DISTINCT station_line.id_linea AS "id"
         FROM tbl_asignacion_estacion AS assignment
         INNER JOIN tbl_estacion_linea AS station_line
           ON station_line.id_estacion = assignment.id_estacion
         WHERE assignment.id_empleado = $1
           AND assignment.estado_asignacion = $2
           AND station_line.estado_asignacion = $2
         ORDER BY station_line.id_linea`,
        [employeeId, ASSIGNMENT_STATES.ACTIVE],
      ),
      this.findIds(
        `SELECT DISTINCT pilot_assignment.id_unidad AS "id"
         FROM tbl_asignacion_piloto AS pilot_assignment
         INNER JOIN tbl_asignacion_unidad AS unit_assignment
           ON unit_assignment.id_unidad = pilot_assignment.id_unidad
         WHERE pilot_assignment.id_empleado = $1
         ORDER BY pilot_assignment.id_unidad`,
        [employeeId],
      ),
    ]);

    return { lineIds, stationIds, unitIds };
  }

  private async findIds(
    statement: string,
    parameters: (number | string)[],
  ): Promise<string[]> {
    const rows = await this.queryExecutor.query(statement, parameters);

    return (rows as AssignmentScopeRow[]).map((row) => row.id);
  }
}
