import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { AfectacionEntity } from "./afectacion.entity.js";

/**
 * One state change an afectación made (its target or a cascaded row), so it
 * can later be reverted exactly. revertido = the change is no longer in effect.
 */
@Entity({ name: "tbl_afectacion_cambio" })
export class AfectacionCambioEntity {
  @PrimaryGeneratedColumn({ name: "id_afectacion_cambio", type: "bigint" })
  idCambio!: string;

  @Column({ name: "id_afectacion", type: "bigint" })
  idAfectacion!: string;

  // municipalidad | linea | parada | estacion
  @Column({ name: "entidad_tipo", type: "varchar", length: 20 })
  entidadTipo!: string;

  @Column({ name: "entidad_id", type: "bigint" })
  entidadId!: string;

  @Column({ name: "estado_anterior", type: "varchar", length: 30 })
  estadoAnterior!: string;

  @Column({ name: "estado_nuevo", type: "varchar", length: 30 })
  estadoNuevo!: string;

  @Column({ type: "boolean", default: false })
  revertido!: boolean;

  @ManyToOne(() => AfectacionEntity)
  @JoinColumn({ name: "id_afectacion" })
  afectacion?: AfectacionEntity;
}
