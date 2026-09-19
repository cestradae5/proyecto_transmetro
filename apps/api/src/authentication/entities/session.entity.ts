import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { EmployeeEntity } from "./employee.entity.js";

@Entity({ name: "tbl_sesion" })
export class SessionEntity {
  @PrimaryGeneratedColumn({ name: "id_sesion", type: "bigint" })
  id!: string;

  @Column({ length: 64, name: "token_hash", type: "char" })
  tokenHash!: string;

  @Column({ name: "fecha_creacion", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "fecha_expiracion", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "fecha_revocacion", nullable: true, type: "timestamptz" })
  revokedAt!: Date | null;

  @ManyToOne(() => EmployeeEntity, (employee) => employee.sessions, {
    nullable: false,
  })
  @JoinColumn({ name: "id_empleado" })
  employee!: Relation<EmployeeEntity>;
}
