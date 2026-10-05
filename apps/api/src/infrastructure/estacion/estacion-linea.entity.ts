import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { LineaEntity } from "../linea/linea.entity.js";

export enum TipoPunto {
  PRINCIPAL = "PRINCIPAL",
  CONTROL = "CONTROL",
  APOYO = "APOYO",
}

export enum EstadoAsignacionLinea {
  ACTIVA = "ACTIVA",
  INACTIVA = "INACTIVA",
}

// Junction table between tbl_estacion and tbl_linea (see database/init.sql).
// Composite PK (id_linea, id_estacion).
@Entity({ name: "tbl_estacion_linea" })
export class EstacionLineaEntity {
  @PrimaryColumn({ name: "id_linea", type: "bigint" })
  idLinea!: string;

  @PrimaryColumn({ name: "id_estacion", type: "bigint" })
  idEstacion!: string;

  @Column({ name: "tipo_punto", type: "varchar", length: 20, enum: TipoPunto })
  tipoPunto!: TipoPunto;

  @Column({
    name: "estado_asignacion",
    type: "varchar",
    length: 30,
    enum: EstadoAsignacionLinea,
  })
  estadoAsignacion!: EstadoAsignacionLinea;

  @ManyToOne(() => LineaEntity)
  @JoinColumn({ name: "id_linea" })
  linea?: LineaEntity;
}
