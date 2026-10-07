import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { ESTADO_ASIGNACION } from "../fleet/asignacion-estacion/asignacion-estacion.entity.js";
import { ROLE_CODES } from "../fleet/shared/fleet.constants.js";
import type {
  ProfileLineDto,
  ProfileResponseDto,
  ProfileStationDto,
} from "./dto/profile-response.dto.js";

interface EmployeeRow {
  employeeId: string;
  name: string;
  email: string;
  roleName: string;
  roleCode: string;
  licenseNumber: string | null;
}

interface StationRow {
  idEstacion: string;
  nombreEstacion: string;
}

interface LineRow {
  idLinea: string;
  numeroLinea: string;
  nombreLinea: string;
  colorHex: string;
}

// Read-only own-profile view. The assignment shown depends on the role:
// station operators get their ACTIVA station, pilots get the line of their
// unit; other roles get no assignment. Stateless dataSource pattern, same as
// EstacionOperadorService.
@Injectable()
export class ProfileService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getProfile(employeeId: string): Promise<ProfileResponseDto> {
    const employee = await this.findEmployee(employeeId);
    if (!employee) {
      throw new NotFoundException("Employee not found");
    }

    const profile: ProfileResponseDto = {
      employeeId: String(employee.employeeId),
      name: employee.name,
      email: employee.email,
      role: { code: employee.roleCode, name: employee.roleName },
    };

    if (employee.roleCode === ROLE_CODES.OPERADOR_ESTACION) {
      const station = await this.findActiveStation(employeeId);
      if (station) {
        profile.station = station;
      }
    } else if (employee.roleCode === ROLE_CODES.PILOTO) {
      profile.licenseNumber = employee.licenseNumber ?? null;
      const line = await this.findPilotLine(employeeId);
      if (line) {
        profile.line = line;
      }
    }

    return profile;
  }

  private async findEmployee(employeeId: string): Promise<EmployeeRow | null> {
    const rows = (await this.dataSource.query(
      `SELECT e.id_emple AS "employeeId",
              e.nombre_emple AS "name",
              e.correo_emple AS "email",
              r.nombre_rol AS "roleName",
              r.codigo AS "roleCode",
              e.licencia_emple AS "licenseNumber"
         FROM tbl_empleado e
         INNER JOIN tbl_rol r ON r.id_rol = e.id_rol
        WHERE e.id_emple = $1`,
      [employeeId],
    )) as EmployeeRow[];
    return rows[0] ?? null;
  }

  private async findActiveStation(employeeId: string): Promise<ProfileStationDto | null> {
    const rows = (await this.dataSource.query(
      `SELECT s.id_estacion AS "idEstacion",
              s.nombre_estacion AS "nombreEstacion"
         FROM tbl_asignacion_estacion a
         INNER JOIN tbl_estacion s ON s.id_estacion = a.id_estacion
        WHERE a.id_empleado = $1 AND a.estado_asignacion = $2
        ORDER BY a.fecha_asignacion DESC
        LIMIT 1`,
      [employeeId, ESTADO_ASIGNACION.ACTIVA],
    )) as StationRow[];
    const row = rows[0];
    return row ? { idEstacion: String(row.idEstacion), nombreEstacion: row.nombreEstacion } : null;
  }

  private async findPilotLine(employeeId: string): Promise<ProfileLineDto | null> {
    const rows = (await this.dataSource.query(
      `SELECT l.id_linea AS "idLinea",
              l.numero_linea AS "numeroLinea",
              l.nombre_linea AS "nombreLinea",
              l.color_hex AS "colorHex"
         FROM tbl_asignacion_piloto ap
         INNER JOIN tbl_asignacion_unidad au ON au.id_unidad = ap.id_unidad
         INNER JOIN tbl_linea l ON l.id_linea = au.id_linea
        WHERE ap.id_empleado = $1
        LIMIT 1`,
      [employeeId],
    )) as LineRow[];
    const row = rows[0];
    return row
      ? {
          idLinea: String(row.idLinea),
          numeroLinea: row.numeroLinea,
          nombreLinea: row.nombreLinea,
          colorHex: row.colorHex,
        }
      : null;
  }
}
