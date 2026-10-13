import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { EmployeeEntity } from "./employee.entity.js";

export const AUDIT_RESULTS = {
  ERROR: "ERROR",
  FAILURE: "FALLIDO",
  SUCCESS: "EXITOSO",
} as const;

export type AuditResult = (typeof AUDIT_RESULTS)[keyof typeof AUDIT_RESULTS];

@Entity({ name: "tbl_bitacora" })
export class AuditLogEntity {
  @PrimaryGeneratedColumn({ name: "id_bitacora", type: "bigint" })
  id!: string;

  @Column({ name: "fecha_hora", type: "timestamptz" })
  createdAt!: Date;

  @Column({ length: 60, name: "modulo", type: "varchar" })
  module!: string;

  @Column({ length: 80, name: "accion", type: "varchar" })
  action!: string;

  @Column({ length: 60, name: "entidad_tipo", type: "varchar" })
  entityType!: string;

  @Column({ name: "entidad_id", nullable: true, type: "bigint" })
  entityId!: string | null;

  @Column({ length: 30, name: "resultado", type: "varchar" })
  result!: AuditResult;

  @Column({ name: "detalle", nullable: true, type: "jsonb" })
  detalle?: Record<string, unknown> | null;

  // Nullable: a failed login records that an attempt happened without tying it
  // to any employee (and with no attempted email), so id_empleado is null.
  @ManyToOne(() => EmployeeEntity, (employee) => employee.auditLogs, {
    nullable: true,
  })
  @JoinColumn({ name: "id_empleado" })
  employee!: Relation<EmployeeEntity> | null;
}
