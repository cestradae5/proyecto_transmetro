import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

export enum EstadoMunicipalidad {
  ACTIVA = "ACTIVA",
  INACTIVA = "INACTIVA",
}

// Mirrors tbl_municipalidad (database/init.sql). nombre_municipalidad is
// UNIQUE and estado_municipalidad is CHECKed to ACTIVA/INACTIVA (default ACTIVA).
@Entity({ name: "tbl_municipalidad" })
export class MunicipalidadEntity {
  @PrimaryGeneratedColumn({ name: "id_municipalidad", type: "bigint" })
  idMunicipalidad!: string;

  @Column({
    name: "nombre_municipalidad",
    type: "varchar",
    length: 120,
    unique: true,
  })
  nombreMunicipalidad!: string;

  @Column({ name: "departamento", type: "varchar", length: 60 })
  departamento!: string;

  @Column({
    name: "estado_municipalidad",
    type: "varchar",
    length: 20,
    enum: EstadoMunicipalidad,
    default: EstadoMunicipalidad.ACTIVA,
  })
  estadoMunicipalidad!: EstadoMunicipalidad;
}
