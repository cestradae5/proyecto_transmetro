import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from "typeorm";

export enum EstadoParada {
  ACTIVA = "ACTIVA",
  CERRADA = "CERRADA",
  MANTENIMIENTO = "MANTENIMIENTO",
}

@Entity({ name: "tbl_parada" })
export class ParadaEntity {
  @PrimaryGeneratedColumn({ name: "id_parada", type: "bigint" })
  idParada!: string;

  @Column({ name: "nombre_parada", type: "varchar", length: 120 })
  nombreParada!: string;

  @Column({ type: "decimal", precision: 10, scale: 8 })
  latitud!: number;

  @Column({ type: "decimal", precision: 11, scale: 8 })
  longitud!: number;

  @Column({
    name: "estado_parada",
    type: "varchar",
    length: 20,
    enum: EstadoParada,
  })
  estadoParada!: EstadoParada;
}
