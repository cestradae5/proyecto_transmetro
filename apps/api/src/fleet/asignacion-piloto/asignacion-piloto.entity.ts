import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

// Pilot-to-unit assignment (design.md Interfaces/Contracts, task 4.2.1).
// Column names/types verified against database/init.sql's
// tbl_asignacion_piloto definition (id_empleado UNIQUE, id_unidad UNIQUE —
// enforces a strict 1:1 pairing in both directions).
//
// `fechaAsignacion` has no DB default (design.md Decision 5, Key Learning 2;
// same constraint already applied to UnidadEntity/AsignacionUnidadEntity) —
// AsignacionPilotoService MUST set it explicitly on every insert. It is
// never touched again by reassign: only `idUnidad` and `fechaActualizacion`
// change when a pilot moves to a different unit — `fechaAsignacion` keeps
// recording the pilot's original assignment date.
@Entity({ name: "tbl_asignacion_piloto" })
export class AsignacionPilotoEntity {
  @PrimaryGeneratedColumn({ name: "id_asignacion_piloto", type: "bigint" })
  id!: string;

  @Column({ name: "fecha_asignacion", type: "timestamptz" })
  fechaAsignacion!: Date;

  @Column({ name: "fecha_actualizacion", type: "timestamptz" })
  fechaActualizacion!: Date;

  // UNIQUE at DB level: a pilot may be assigned to at most one unit.
  @Column({ name: "id_empleado", type: "bigint" })
  idEmpleado!: string;

  // UNIQUE at DB level: a unit may have at most one pilot assigned.
  @Column({ name: "id_unidad", type: "bigint" })
  idUnidad!: string;
}
