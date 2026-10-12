import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { LineaEntity } from "../linea/linea.entity.js";
import { MunicipalidadEntity } from "./municipalidad.entity.js";

// Junction table between tbl_linea and tbl_municipalidad (see database/init.sql).
// Composite PK (id_linea, id_municipalidad); the row carries no extra columns.
@Entity({ name: "tbl_linea_municipalidad" })
export class LineaMunicipalidadEntity {
  @PrimaryColumn({ name: "id_linea", type: "bigint" })
  idLinea!: string;

  @PrimaryColumn({ name: "id_municipalidad", type: "bigint" })
  idMunicipalidad!: string;

  @ManyToOne(() => LineaEntity)
  @JoinColumn({ name: "id_linea" })
  linea?: LineaEntity;

  @ManyToOne(() => MunicipalidadEntity)
  @JoinColumn({ name: "id_municipalidad" })
  municipalidad?: MunicipalidadEntity;
}
