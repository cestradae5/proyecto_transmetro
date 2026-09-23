import type { Repository, ObjectLiteral } from "typeorm";
import { NotFoundError } from "../filters/domain-exception.filter.js";

/**
 * Valida que una FK exista en la tabla referenciada.
 * Lanza NotFoundError si no existe.
 *
 * @param repo - Repositorio de TypeORM de la entidad referenciada
 * @param id - ID de la FK a validar
 * @param entityName - Nombre legible de la entidad para mensajes de error
 */
export async function validateForeignKey<T extends ObjectLiteral>(
  repo: Repository<T>,
  id: string,
  entityName: string,
): Promise<void> {
  const exists = await repo.existsBy({ id } as any);

  if (!exists) {
    throw new NotFoundError(`${entityName} con ID ${id} no existe.`);
  }
}
