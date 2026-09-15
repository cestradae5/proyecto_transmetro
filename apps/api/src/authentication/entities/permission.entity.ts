import {
  Column,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { RoleEntity } from "./role.entity.js";

@Entity({ name: "tbl_permiso" })
export class PermissionEntity {
  @PrimaryGeneratedColumn({ name: "id_permiso", type: "bigint" })
  id!: string;

  @Column({ length: 80, name: "codigo_permiso", type: "varchar" })
  code!: string;

  @Column({ length: 160, name: "accion_permiso", type: "varchar" })
  action!: string;

  @ManyToMany(() => RoleEntity, (role) => role.permissions)
  roles!: Relation<RoleEntity[]>;
}
