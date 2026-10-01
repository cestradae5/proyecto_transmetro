import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

// Estados de una unidad (design.md Interfaces / Contracts, Decision 7).
// Single-sourced here and imported by the DTOs, instead of the
// independent enum redeclaration pattern the existing
// Parqueo/Linea entities use (design.md Decision 7 rationale).
export enum EstadoUnidad {
  DISPONIBLE = "DISPONIBLE",
  EN_SERVICIO = "EN_SERVICIO",
  MANTENIMIENTO = "MANTENIMIENTO",
  FUERA_DE_SERVICIO = "FUERA_DE_SERVICIO",
}

@Entity({ name: "tbl_unidad" })
export class UnidadEntity {
  @PrimaryGeneratedColumn({ name: "id_unidad", type: "bigint" })
  id!: string;

  @Column({ name: "numero_placa", type: "varchar", length: 20 })
  numeroPlaca!: string;

  @Column({ name: "marca", type: "varchar", length: 60 })
  marca!: string;

  @Column({ name: "modelo", type: "varchar", length: 60 })
  modelo!: string;

  @Column({ name: "anio", type: "int" })
  anio!: number;

  @Column({ name: "capacidad_pasajeros", type: "int" })
  capacidadPasajeros!: number;

  @Column({
    name: "estado_unidad",
    type: "varchar",
    length: 30,
    enum: EstadoUnidad,
  })
  estadoUnidad!: EstadoUnidad;

  // No @CreateDateColumn/@UpdateDateColumn: the DB DEFAULT CURRENT_TIMESTAMP
  // only fires on INSERT (Postgres semantics), and a plain @Column never
  // auto-populates on update either. UnidadService MUST set both fields
  // explicitly on every write (design.md Decision 5, Key Learning 2).
  @Column({ name: "fecha_registro", type: "timestamptz" })
  fechaRegistro!: Date;

  @Column({ name: "fecha_actualizacion", type: "timestamptz" })
  fechaActualizacion!: Date;
}
