import type { EntityManager } from "typeorm";

import { EmployeeEntity } from "../../authentication/entities/employee.entity.js";

export interface PilotEligibility {
  id: string;
  roleCode: string;
}

// Lookup de solo lectura del código de rol de un empleado por id
// (design.md Decision 1). Sigue el mismo patrón sin estado que
// EmployeeRepository: recibe el EntityManager de la transacción del
// llamador en lugar de mantener un repositorio inyectado, así funciona
// dentro de cualquier transacción de fleet. No filtra por estado_emple ni
// toma lock — a diferencia de EmployeeRepository.findEligibleByEmail (que
// resuelve login), esta consulta es de solo lectura para validar el
// código de rol de un piloto ya identificado por id.
export class PilotEligibilityLookup {
  async findRoleCode(
    manager: EntityManager,
    employeeId: string,
  ): Promise<PilotEligibility | null> {
    const employee = await manager
      .getRepository(EmployeeEntity)
      .createQueryBuilder("employee")
      .innerJoinAndSelect("employee.role", "role")
      .where("employee.id = :employeeId", { employeeId })
      .getOne();

    if (!employee) {
      return null;
    }

    return { id: employee.id, roleCode: employee.role.code };
  }
}
