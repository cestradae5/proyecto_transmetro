import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

// Unit-to-line assignment (design.md Interfaces / Contracts, task 3.2.1).
// Column names/types verified against database/init.sql's
// tbl_asignacion_unidad definition (id_unidad UNIQUE, id_linea NOT NULL,
// id_linea_parada_actual nullable FK to tbl_linea_parada).
//
// `fechaAsignacion` has no DB default (unlike `fechaActualizacion`, which
// defaults to CURRENT_TIMESTAMP on INSERT only) — AsignacionUnidadService
// MUST set it explicitly on every write (design.md Decision 5, Key
// Learning 2; same constraint already applied to UnidadEntity).
@Entity({ name: "tbl_asignacion_unidad" })
export class AsignacionUnidadEntity {
  @PrimaryGeneratedColumn({ name: "id_asignacion_unidad", type: "bigint" })
  id!: string;

  @Column({ name: "fecha_asignacion", type: "timestamptz" })
  fechaAsignacion!: Date;

  @Column({ name: "fecha_actualizacion", type: "timestamptz" })
  fechaActualizacion!: Date;

  // UNIQUE at DB level: a unit may have at most one active line assignment.
  @Column({ name: "id_unidad", type: "bigint" })
  idUnidad!: string;

  @Column({ name: "id_linea", type: "bigint" })
  idLinea!: string;

  // References tbl_linea_parada.id_linea_parada (the line-stop junction
  // row), not tbl_parada directly — a "stop" in this domain is a specific
  // position in a specific line's sequence.
  @Column({ name: "id_linea_parada_actual", type: "bigint", nullable: true })
  idLineaParadaActual!: string | null;

  @Column({ name: "fecha_reporte_ubicacion", type: "timestamptz", nullable: true })
  fechaReporteUbicacion!: Date | null;
}
