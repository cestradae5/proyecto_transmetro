import { NotFoundException } from "@nestjs/common";
import { Repository, ObjectLiteral } from "typeorm";

/**
 * Validates that a foreign key exists in the referenced table.
 *
 * One existence query against the caller-supplied `fieldName`, which is the real
 * primary key of the referenced entity (`idParada`, `idEstacion`, `idParqueo`)
 * and is the same value interpolated into the error message. A previous version
 * ran `count` and then a redundant `findOne` with an identical `where` clause,
 * costing a second round trip on every rejection for no extra information.
 *
 * Throws NotFoundException naming the referenced entity if not found.
 */
export async function validateForeignKey<T extends ObjectLiteral>(
  repository: Repository<T>,
  id: string | number,
  fieldName: string,
  entityName: string
): Promise<void> {
  const matches = await repository.count({ where: { [fieldName]: id } as any });

  if (matches === 0) {
    throw new NotFoundException(`${entityName} con ID ${id} no encontrada`);
  }
}
