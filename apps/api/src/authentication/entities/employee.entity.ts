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

  @ManyToOne(() => RoleEntity, (role) => role.employees, { nullable: false })
  @JoinColumn({ name: "id_rol" })
  role!: Relation<RoleEntity>;

  @OneToMany(() => SessionEntity, (session) => session.employee)
  sessions!: Relation<SessionEntity[]>;

  @OneToMany(() => AuditLogEntity, (auditLog) => auditLog.employee)
  auditLogs!: Relation<AuditLogEntity[]>;
}
