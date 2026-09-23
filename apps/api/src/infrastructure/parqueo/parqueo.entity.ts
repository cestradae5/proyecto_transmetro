import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { EstacionEntity } from "../estacion/estacion.entity.js";

export enum TipoParqueo {
  CENTRAL = "CENTRAL",
  AUXILIAR = "AUXILIAR",
  TEMPORAL = "TEMPORAL",
}

export enum EstadoParqueo {
  ACTIVO = "ACTIVO",
  CERRADO = "CERRADO",
  MANTENIMIENTO = "MANTENIMIENTO",
}

@Entity({ name: "tbl_parqueo" })
export class ParqueoEntity {
  @PrimaryGeneratedColumn({ name: "id_parqueo", type: "bigint" })
  idParqueo!: string;

  @Column({ name: "nombre_parqueo", type: "varchar", length: 120 })
  nombreParqueo!: string;

  @Column({
    name: "tipo_parqueo",
    type: "varchar",
    length: 20,
    enum: TipoParqueo,
  })
  tipoParqueo!: TipoParqueo;

  @Column({ type: "varchar", length: 250 })
  direccion!: string;

  @Column({ type: "decimal", precision: 10, scale: 8 })
  latitud!: number;

  @Column({ type: "decimal", precision: 11, scale: 8 })
  longitud!: number;

  @Column({ name: "capacidad_unidades", type: "int" })
  capacidadUnidades!: number;

  @Column({
    name: "estado_parqueo",
    type: "varchar",
    length: 20,
    enum: EstadoParqueo,
  })
  estadoParqueo!: EstadoParqueo;

  @Column({ name: "id_estacion", type: "bigint" })
  idEstacion!: string;

  @ManyToOne(() => EstacionEntity)
  @JoinColumn({ name: "id_estacion" })
  estacion!: EstacionEntity;
}
