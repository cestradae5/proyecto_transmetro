import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from "typeorm";
import { LineaEntity } from "./linea.entity.js";
import { ParadaEntity } from "../parada/parada.entity.js";

// Junction table between tbl_linea and tbl_parada (see database/init.sql).
// DB constraints: orden > 0, minutos_hasta_siguiente >= 0,
// UNIQUE (id_linea, orden), UNIQUE (id_linea, id_parada).
@Entity({ name: "tbl_linea_parada" })
@Unique(["idLinea", "orden"])
@Unique(["idLinea", "idParada"])
export class LineaParadaEntity {
  @PrimaryGeneratedColumn({ name: "id_linea_parada", type: "bigint" })
  idLineaParada!: string;

  @Column({ name: "orden", type: "integer" })
  orden!: number;

  @Column({ name: "minutos_hasta_siguiente", type: "integer" })
  minutosHastaSiguiente!: number;

  @Column({ name: "id_parada", type: "bigint" })
  idParada!: string;

  @Column({ name: "id_linea", type: "bigint" })
  idLinea!: string;

  @ManyToOne(() => ParadaEntity)
  @JoinColumn({ name: "id_parada" })
  parada?: ParadaEntity;

  @ManyToOne(() => LineaEntity)
  @JoinColumn({ name: "id_linea" })
  linea?: LineaEntity;
}
