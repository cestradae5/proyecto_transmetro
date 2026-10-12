import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

import { ParadaEntity } from "../parada/parada.entity.js";

export enum TipoAcceso {
  PEATONAL = "PEATONAL",
  RAMPA = "RAMPA",
  ESCALERA = "ESCALERA",
  ELEVADOR = "ELEVADOR",
}

export enum EstadoAcceso {
  HABILITADO = "HABILITADO",
  DESHABILITADO = "DESHABILITADO",
}

// Mirrors tbl_acceso (database/init.sql). An acceso (entrance) always belongs
// to one parada; tipo_acceso and estado_acceso are CHECKed to the enums above
// and estado_acceso defaults to HABILITADO.
@Entity({ name: "tbl_acceso" })
export class AccesoEntity {
  @PrimaryGeneratedColumn({ name: "id_acceso", type: "bigint" })
  idAcceso!: string;

  @Column({ name: "id_parada", type: "bigint" })
  idParada!: string;

  @ManyToOne(() => ParadaEntity, { nullable: false })
  @JoinColumn({ name: "id_parada" })
  parada?: ParadaEntity;

  @Column({ name: "nombre_acceso", type: "varchar", length: 120 })
  nombreAcceso!: string;

  @Column({ type: "decimal", precision: 10, scale: 8 })
  latitud!: number;

  @Column({ type: "decimal", precision: 11, scale: 8 })
  longitud!: number;

  @Column({ name: "tipo_acceso", type: "varchar", length: 20, enum: TipoAcceso })
  tipoAcceso!: TipoAcceso;

  @Column({
    name: "estado_acceso",
    type: "varchar",
    length: 20,
    enum: EstadoAcceso,
    default: EstadoAcceso.HABILITADO,
  })
  estadoAcceso!: EstadoAcceso;
}
