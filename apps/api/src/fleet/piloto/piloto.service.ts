import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import {
  EMPLOYEE_STATUSES,
  EmployeeEntity,
} from "../../authentication/entities/employee.entity.js";
import { AsignacionPilotoEntity } from "../asignacion-piloto/asignacion-piloto.entity.js";
import { ROLE_CODES } from "../shared/fleet.constants.js";
import type { PilotoResponseDto } from "./dto/piloto-response.dto.js";

interface PilotRow {
  idEmpleado: string;
  nombre: string;
  idUnidad: string | null;
}

// Read-only listing of pilots eligible for assignment. Same stateless
// `dataSource.getRepository` pattern as the other fleet services.
@Injectable()
export class PilotoService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // Single query (no N+1): ACTIVE employees whose role is PILOTO, left-joined
  // to their (at most one) current unit assignment. Only id/name/unit
  // columns are selected, so email and other fields never leave the DB.
  async listEligiblePilots(): Promise<PilotoResponseDto[]> {
    const rows = await this.dataSource
      .getRepository(EmployeeEntity)
      .createQueryBuilder("employee")
      .innerJoin("employee.role", "role")
      .leftJoin(AsignacionPilotoEntity, "asignacion", "asignacion.idEmpleado = employee.id")
      .select("employee.id", "idEmpleado")
      .addSelect("employee.name", "nombre")
      .addSelect("asignacion.idUnidad", "idUnidad")
      .where("employee.status = :status", { status: EMPLOYEE_STATUSES.ACTIVE })
      .andWhere("role.code = :roleCode", { roleCode: ROLE_CODES.PILOTO })
      .orderBy("employee.name", "ASC")
      .getRawMany<PilotRow>();

    return rows.map((row) => {
      const pilot: PilotoResponseDto = { idEmpleado: String(row.idEmpleado), nombre: row.nombre };
      if (row.idUnidad !== null && row.idUnidad !== undefined) {
        pilot.idUnidad = String(row.idUnidad);
      }
      return pilot;
    });
  }
}
