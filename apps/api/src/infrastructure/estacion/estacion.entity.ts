import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
} from "typeorm";

import { ParadaEntity } from "../parada/parada.entity.js";

@Entity({ name: "tbl_estacion" })
export class EstacionEntity {
  @PrimaryGeneratedColumn({ name: "id_estacion", type: "bigint" })
  idEstacion!: string;

  @Column({ name: "nombre_estacion", type: "varchar", length: 120 })
  nombreEstacion!: string;

  @Column({ type: "decimal", precision: 10, scale: 8 })
  latitud!: number;

  @Column({ type: "decimal", precision: 11, scale: 8 })
  longitud!: number;

  @Column({ name: "estado_estacion", type: "varchar", length: 30 })
  estadoEstacion!: string;

  @Column({ name: "id_parada", type: "bigint", nullable: true })
  idParada?: string;

  @ManyToOne(() => ParadaEntity, { nullable: true })
  @JoinColumn({ name: "id_parada" })
  parada?: ParadaEntity;
}
