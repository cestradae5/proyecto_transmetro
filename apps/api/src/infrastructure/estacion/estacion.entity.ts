import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Generated,
  ManyToOne,
  JoinColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
} from "typeorm";

import { ParadaEntity } from "../parada/parada.entity.js";

@Entity({ name: "tbl_estacion" })
export class EstacionEntity {
  @Generated("increment")
  @PrimaryGeneratedColumn({ name: "id_estacion", type: "bigint" })
  idEstacion!: number;

  @Column({ name: "nombre_estacion", type: "varchar", length: 120 })
  nombreEstacion!: string;

  @Column({ type: "decimal", precision: 10, scale: 8 })
  latitud!: number;

  @Column({ type: "decimal", precision: 11, scale: 8 })
  longitud!: number;

  @Column({ name: "estado_estacion", type: "varchar", length: 30 })
  estadoEstacion!: string;

  // 1:1 extension of a parada: tbl_estacion.id_parada is NOT NULL UNIQUE.
  @Column({ name: "id_parada", type: "bigint", unique: true })
  idParada!: number;

  @ManyToOne(() => ParadaEntity, { nullable: false })
  @JoinColumn({ name: "id_parada" })
  parada?: ParadaEntity;
}
