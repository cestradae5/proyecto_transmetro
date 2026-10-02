import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { AuditLogEntity } from "./audit-log.entity.js";
import { RoleEntity } from "./role.entity.js";
import { SessionEntity } from "./session.entity.js";

export const EMPLOYEE_STATUSES = {
  ACTIVE: "ACTIVO",
  INACTIVE: "INACTIVO",
} as const;

export type EmployeeStatus =
  (typeof EMPLOYEE_STATUSES)[keyof typeof EMPLOYEE_STATUSES];

@Entity({ name: "tbl_empleado" })
export class EmployeeEntity {
  @PrimaryGeneratedColumn({ name: "id_emple", type: "bigint" })
  id!: string;

  @Column({ length: 120, name: "nombre_emple", type: "varchar" })
  name!: string;

  @Column({ length: 20, name: "estado_emple", type: "varchar" })
  status!: EmployeeStatus;

  @Column({ length: 254, name: "correo_emple", type: "varchar" })
  email!: string;

  @Column({ length: 20, name: "telefono_emple", nullable: true, type: "varchar" })
  phone!: string | null;

  @Column({ length: 13, name: "dpi_emple", nullable: true, type: "varchar" })
  dpi!: string | null;

  @Column({ name: "fecha_ingreso_emple", nullable: true, type: "date" })
  hireDate!: string | null;

  @Column({ length: 255, name: "direccion_emple", nullable: true, type: "varchar" })
  address!: string | null;

  @Column({ length: 30, name: "licencia_emple", nullable: true, type: "varchar" })
  licenseNumber!: string | null;

  @Column({ name: "historial_educativo_emple", nullable: true, type: "text" })
  educationHistory!: string | null;

  @Column({ name: "idiomas_emple", nullable: true, type: "text" })
  languages!: string | null;

  @ManyToOne(() => RoleEntity, (role) => role.employees, { nullable: false })
  @JoinColumn({ name: "id_rol" })
  role!: Relation<RoleEntity>;

  @OneToMany(() => SessionEntity, (session) => session.employee)
  sessions!: Relation<SessionEntity[]>;

  @OneToMany(() => AuditLogEntity, (auditLog) => auditLog.employee)
  auditLogs!: Relation<AuditLogEntity[]>;
}
