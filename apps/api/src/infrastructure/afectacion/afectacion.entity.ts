import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ParadaEntity } from "../parada/parada.entity.js";
import { EstacionEntity } from "../estacion/estacion.entity.js";

export enum TipoAfectacion {
  TEMPORAL = "TEMPORAL",
  PERMANENTE = "PERMANENTE",
  MANTENIMIENTO = "MANTENIMIENTO",
}

export enum EstadoAfectacion {
  ACTIVA = "ACTIVA",
  CERRADA = "CERRADA",
  PENDIENTE = "PENDIENTE",
}

@Entity({ name: "tbl_afectacion" })
export class AfectacionEntity {
  @PrimaryGeneratedColumn({ name: "id_afectacion", type: "bigint" })
  idAfectacion!: string;

  @Column({
    name: "tipo_afectacion",
    type: "varchar",
    length: 20,
    enum: TipoAfectacion,
  })
  tipoAfectacion!: TipoAfectacion;

  @Column({ type: "text" })
  motivo!: string;

  @Column({ name: "fecha_inicio", type: "date" })
  fechaInicio!: Date;

  @Column({ name: "fecha_fin", type: "date", nullable: true })
  fechaFin?: Date;

  @Column({
    name: "estado_afectacion",
    type: "varchar",
    length: 20,
    enum: EstadoAfectacion,
  })
  estadoAfectacion!: EstadoAfectacion;

  // XOR: one of these must be set, not both
  @Column({ name: "id_parada", type: "bigint", nullable: true })
  idParada?: string;

  @Column({ name: "id_estacion", type: "bigint", nullable: true })
  idEstacion?: string;

  @ManyToOne(() => ParadaEntity, { nullable: true })
  @JoinColumn({ name: "id_parada" })
  parada?: ParadaEntity;

  @ManyToOne(() => EstacionEntity, { nullable: true })
  @JoinColumn({ name: "id_estacion" })
  estacion?: EstacionEntity;
}
