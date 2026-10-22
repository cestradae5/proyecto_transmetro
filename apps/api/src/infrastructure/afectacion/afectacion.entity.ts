import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { LineaEntity } from "../linea/linea.entity.js";
import { ParadaEntity } from "../parada/parada.entity.js";
import { EstacionEntity } from "../estacion/estacion.entity.js";
import { MunicipalidadEntity } from "../municipalidad/municipalidad.entity.js";

/** What an afectación does to its target. Stored in tipo_afectacion. */
export enum AccionAfectacion {
  ACTIVAR = "ACTIVAR",
  DESACTIVAR = "DESACTIVAR",
}

/**
 * estado_afectacion is NOT NULL in the schema. An afectación is applied the
 * moment it is created (or edited), so every new row stores APLICADA; rows
 * written before the activate/deactivate model keep their original value.
 */
export const ESTADO_AFECTACION_APLICADA = "APLICADA";

@Entity({ name: "tbl_afectacion" })
export class AfectacionEntity {
  @PrimaryGeneratedColumn({ name: "id_afectacion", type: "bigint" })
  idAfectacion!: string;

  // Legacy rows may hold TEMPORAL/PERMANENTE/MANTENIMIENTO.
  @Column({ name: "tipo_afectacion", type: "varchar", length: 50 })
  tipoAfectacion!: string;

  @Column({ type: "text" })
  motivo!: string;

  @Column({ name: "fecha_inicio", type: "timestamptz" })
  fechaInicio!: Date | string;

  @Column({ name: "fecha_fin", type: "timestamptz", nullable: true })
  fechaFin!: Date | string | null;

  @Column({ name: "estado_afectacion", type: "varchar", length: 30 })
  estadoAfectacion!: string;

  // Exactly one of these is set (chk_afectacion_objetivo).
  @Column({ name: "id_municipalidad", type: "bigint", nullable: true })
  idMunicipalidad!: string | null;

  @Column({ name: "id_linea", type: "bigint", nullable: true })
  idLinea!: string | null;

  @Column({ name: "id_parada", type: "bigint", nullable: true })
  idParada!: string | null;

  @Column({ name: "id_estacion", type: "bigint", nullable: true })
  idEstacion!: string | null;

  @ManyToOne(() => MunicipalidadEntity, { nullable: true })
  @JoinColumn({ name: "id_municipalidad" })
  municipalidad?: MunicipalidadEntity;

  @ManyToOne(() => LineaEntity, { nullable: true })
  @JoinColumn({ name: "id_linea" })
  linea?: LineaEntity;

  @ManyToOne(() => ParadaEntity, { nullable: true })
  @JoinColumn({ name: "id_parada" })
  parada?: ParadaEntity;

  @ManyToOne(() => EstacionEntity, { nullable: true })
  @JoinColumn({ name: "id_estacion" })
  estacion?: EstacionEntity;
}
