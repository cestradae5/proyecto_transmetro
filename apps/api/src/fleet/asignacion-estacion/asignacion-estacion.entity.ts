import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

export const ESTADO_ASIGNACION = {
  ACTIVA: "ACTIVA",
  INACTIVA: "INACTIVA",
} as const;

export type EstadoAsignacion =
  (typeof ESTADO_ASIGNACION)[keyof typeof ESTADO_ASIGNACION];

// Station-operator assignment. Column names/types match database/init.sql's
// tbl_asignacion_estacion. `fechaAsignacion` has no DB default: the service
// layer MUST set it explicitly on every insert.
@Entity({ name: "tbl_asignacion_estacion" })
export class AsignacionEstacionEntity {
  @PrimaryGeneratedColumn({ name: "id_asignacion_estacion", type: "bigint" })
  id!: string;

  @Column({ name: "fecha_asignacion", type: "timestamptz" })
  fechaAsignacion!: Date;

  @Column({ name: "estado_asignacion", type: "varchar", length: 30 })
  estadoAsignacion!: EstadoAsignacion;

  @Column({ name: "id_empleado", type: "bigint" })
  idEmpleado!: string;

  @Column({ name: "id_estacion", type: "bigint" })
  idEstacion!: string;
}
