import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import {
  EMPLOYEE_STATUSES,
  EmployeeEntity,
} from "../../authentication/entities/employee.entity.js";
import {
  AsignacionEstacionEntity,
  ESTADO_ASIGNACION,
} from "../asignacion-estacion/asignacion-estacion.entity.js";
import { ROLE_CODES } from "../shared/fleet.constants.js";
import type { OperadorEstacionResponseDto } from "./dto/operador-estacion-response.dto.js";

interface OperatorRow {
  idEmpleado: string;
  nombre: string;
  idEstacion: string | null;
}

// Read-only listing of station operators eligible for assignment (same
// stateless pattern as PilotoService).
@Injectable()
export class OperadorEstacionService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // Single query: ACTIVE employees with role OPERADOR_ESTACION, left-joined to
  // their ACTIVA station assignment (at most one by service-level invariant).
  async listOperators(): Promise<OperadorEstacionResponseDto[]> {
    const rows = await this.dataSource
      .getRepository(EmployeeEntity)
      .createQueryBuilder("employee")
      .innerJoin("employee.role", "role")
      .leftJoin(
        AsignacionEstacionEntity,
        "asignacion",
        "asignacion.idEmpleado = employee.id AND asignacion.estadoAsignacion = :activa",
        { activa: ESTADO_ASIGNACION.ACTIVA },
      )
      .select("employee.id", "idEmpleado")
      .addSelect("employee.name", "nombre")
      .addSelect("asignacion.idEstacion", "idEstacion")
      .where("employee.status = :status", { status: EMPLOYEE_STATUSES.ACTIVE })
      .andWhere("role.code = :roleCode", { roleCode: ROLE_CODES.OPERADOR_ESTACION })
      .orderBy("employee.name", "ASC")
      .getRawMany<OperatorRow>();

    return rows.map((row) => {
      const operator: OperadorEstacionResponseDto = {
        idEmpleado: String(row.idEmpleado),
        nombre: row.nombre,
      };
      if (row.idEstacion !== null && row.idEstacion !== undefined) {
        operator.idEstacionActual = String(row.idEstacion);
      }
      return operator;
    });
  }
}
