import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { EmployeeEntity } from "./employee.entity.js";
import { PermissionEntity } from "./permission.entity.js";

@Entity({ name: "tbl_rol" })
export class RoleEntity {
  @PrimaryGeneratedColumn({ name: "id_rol", type: "bigint" })
  id!: string;

  @Column({ length: 100, name: "nombre_rol", type: "varchar" })
  name!: string;

  @Column({ length: 50, name: "codigo", type: "varchar" })
  code!: string;

  @Column({ name: "descrip_rol", type: "text" })
  description!: string;

  @Column({ name: "activo", type: "boolean" })
  active!: boolean;

  @Column({ name: "creado_en", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "actualizado_en", type: "timestamptz" })
  updatedAt!: Date;

  @OneToMany(() => EmployeeEntity, (employee) => employee.role)
  employees!: Relation<EmployeeEntity[]>;

  @ManyToMany(() => PermissionEntity, (permission) => permission.roles)
  @JoinTable({
    inverseJoinColumn: { name: "id_permiso", referencedColumnName: "id" },
    joinColumn: { name: "id_rol", referencedColumnName: "id" },
    name: "tbl_rol_permiso",
  })
  permissions!: Relation<PermissionEntity[]>;
}
