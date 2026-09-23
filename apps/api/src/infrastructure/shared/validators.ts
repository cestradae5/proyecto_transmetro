import { NotFoundException } from "@nestjs/common";
import { Repository, ObjectLiteral } from "typeorm";

/**
 * Validates that a foreign key exists in the referenced table.
 * Throws NotFoundException if not found.
 */
export async function validateForeignKey<T extends ObjectLiteral>(
  repository: Repository<T>,
  id: string,
  fieldName: string,
  entityName: string
): Promise<void> {
  const count = await repository.count({ where: { [fieldName]: id } as any });
  
  if (count === 0) {
    // Try with the primary key directly
    const entity = await repository.findOne({ where: { id } as any });
    if (!entity) {
      throw new NotFoundException(`${entityName} con ID ${id} no encontrada`);
    }
  }
}
