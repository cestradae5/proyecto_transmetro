import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ParqueoEntity } from "../parqueo/parqueo.entity.js";

export enum EstadoLinea {
  ACTIVA = "ACTIVA",
  INACTIVA = "INACTIVA",
}

export enum TipoRecorrido {
  CIRCULAR = "CIRCULAR",
  LINEAL = "LINEAL",
}

@Entity({ name: "tbl_linea" })
export class LineaEntity {
  @PrimaryGeneratedColumn({ name: "id_linea", type: "bigint" })
  idLinea!: string;

  @Column({ name: "numero_linea", type: "varchar", length: 10 })
  numeroLinea!: string;

  @Column({ name: "nombre_linea", type: "varchar", length: 120 })
  nombreLinea!: string;

  @Column({ name: "color_hex", type: "varchar", length: 7 })
  colorHex!: string;

  @Column({
    name: "estado_linea",
    type: "varchar",
    length: 20,
    enum: EstadoLinea,
  })
  estadoLinea!: EstadoLinea;

  @Column({
    name: "tipo_recorrido",
    type: "varchar",
    length: 20,
    enum: TipoRecorrido,
  })
  tipoRecorrido!: TipoRecorrido;

  @Column({ name: "id_parqueo", type: "bigint" })
  idParqueo!: string;

  @ManyToOne(() => ParqueoEntity)
  @JoinColumn({ name: "id_parqueo" })
  parqueo!: ParqueoEntity;
}
