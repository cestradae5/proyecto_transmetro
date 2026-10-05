// Errores de dominio del módulo fleet (design.md Decision 3).
// Cada clase nombra la regla de negocio exacta que la origina, en lugar de
// un ConflictException genérico por sitio de lanzamiento — esto permite que
// los tests unitarios verifiquen la clase del error, no un mensaje frágil,
// y mantiene el DomainExceptionFilter puramente mecánico (tipo -> status).

import {
  ConflictError,
  NotFoundError,
} from "../../shared/errors/domain-exception.filter.js";

// ── 404 Not Found ────────────────────────────────────────────────────────

export class UnitNotFound extends NotFoundError {
  constructor(id: string) {
    super(`Unidad con ID ${id} no existe.`);
    this.name = "UnitNotFound";
  }
}

export class LineNotFound extends NotFoundError {
  constructor(id: string) {
    super(`Línea con ID ${id} no existe.`);
    this.name = "LineNotFound";
  }
}

export class EmployeeNotFound extends NotFoundError {
  constructor(id: string) {
    super(`Empleado con ID ${id} no existe.`);
    this.name = "EmployeeNotFound";
  }
}

export class StopNotFound extends NotFoundError {
  constructor(id: string) {
    super(`Parada con ID ${id} no existe.`);
    this.name = "StopNotFound";
  }
}

export class LineAssignmentNotFound extends NotFoundError {
  constructor(unitId: string) {
    super(`La unidad ${unitId} no tiene asignación de línea.`);
    this.name = "LineAssignmentNotFound";
  }
}

export class PilotAssignmentNotFound extends NotFoundError {
  constructor(unitId: string) {
    super(`La unidad ${unitId} no tiene asignación de piloto.`);
    this.name = "PilotAssignmentNotFound";
  }
}

export class PilotHasNoUnitAssigned extends NotFoundError {
  constructor() {
    super("No hay una unidad asignada actualmente.");
    this.name = "PilotHasNoUnitAssigned";
  }
}

export class StationNotFound extends NotFoundError {
  constructor(id: string) {
    super(`Estación con ID ${id} no existe.`);
    this.name = "StationNotFound";
  }
}

export class AssignmentNotFound extends NotFoundError {
  constructor(id: string) {
    super(`Asignación de estación con ID ${id} no existe o no está activa.`);
    this.name = "AssignmentNotFound";
  }
}

export class OperatorHasNoStation extends NotFoundError {
  constructor() {
    super("El operador no tiene una estación asignada actualmente.");
    this.name = "OperatorHasNoStation";
  }
}

// ── 409 Conflict ─────────────────────────────────────────────────────────

export class EmployeeNotStationOperator extends ConflictError {
  constructor() {
    super("Solo empleados activos con rol OPERADOR_ESTACION pueden ser asignados.");
    this.name = "EmployeeNotStationOperator";
  }
}

export class OperatorAlreadyAssigned extends ConflictError {
  constructor() {
    super("El operador ya tiene una estación asignada.");
    this.name = "OperatorAlreadyAssigned";
  }
}

export class DuplicatePlate extends ConflictError {
  constructor(placa: string) {
    super(`El número de placa ${placa} ya está registrado.`);
    this.name = "DuplicatePlate";
  }
}

export class UnitCannotBeCreatedEnServicio extends ConflictError {
  constructor() {
    super(
      "Una unidad nueva no tiene asignaciones y no puede crearse EN_SERVICIO.",
    );
    this.name = "UnitCannotBeCreatedEnServicio";
  }
}

export class EnServicioRequiresBothAssignments extends ConflictError {
  constructor() {
    super("EN_SERVICIO requiere asignación de línea y de piloto.");
    this.name = "EnServicioRequiresBothAssignments";
  }
}

export class UnitAlreadyHasLineAssignment extends ConflictError {
  constructor(unitId: string) {
    super(`La unidad ${unitId} ya tiene una asignación de línea.`);
    this.name = "UnitAlreadyHasLineAssignment";
  }
}

export class LineAssignmentUnchanged extends ConflictError {
  constructor() {
    super("La unidad ya está asignada a esa línea.");
    this.name = "LineAssignmentUnchanged";
  }
}

export class UnitEnServicioCannotUnassignLine extends ConflictError {
  constructor() {
    super("No se puede desasignar la línea mientras la unidad está EN_SERVICIO.");
    this.name = "UnitEnServicioCannotUnassignLine";
  }
}

export class StopNotInAssignedLine extends ConflictError {
  constructor() {
    super("La parada no pertenece a la línea asignada de la unidad.");
    this.name = "StopNotInAssignedLine";
  }
}

export class UnitHasNoLineAssignment extends ConflictError {
  constructor() {
    super("La unidad no tiene una línea asignada; no se puede reportar ubicación.");
    this.name = "UnitHasNoLineAssignment";
  }
}

export class PilotRoleRequired extends ConflictError {
  constructor() {
    super("Solo empleados con rol PILOTO pueden ser asignados.");
    this.name = "PilotRoleRequired";
  }
}

export class PilotAlreadyAssignedToUnit extends ConflictError {
  constructor() {
    super("El piloto ya está asignado a otra unidad.");
    this.name = "PilotAlreadyAssignedToUnit";
  }
}

export class UnitAlreadyHasPilotAssignment extends ConflictError {
  constructor() {
    super("La unidad ya tiene un piloto asignado.");
    this.name = "UnitAlreadyHasPilotAssignment";
  }
}

export class PilotAssignmentUnchanged extends ConflictError {
  constructor() {
    super("El piloto ya está asignado a esa unidad.");
    this.name = "PilotAssignmentUnchanged";
  }
}

export class UnitEnServicioCannotReassignPilot extends ConflictError {
  constructor() {
    super(
      "No se puede reasignar el piloto mientras la unidad actual está EN_SERVICIO.",
    );
    this.name = "UnitEnServicioCannotReassignPilot";
  }
}

export class UnitEnServicioCannotUnassignPilot extends ConflictError {
  constructor() {
    super("No se puede desasignar el piloto mientras la unidad está EN_SERVICIO.");
    this.name = "UnitEnServicioCannotUnassignPilot";
  }
}
