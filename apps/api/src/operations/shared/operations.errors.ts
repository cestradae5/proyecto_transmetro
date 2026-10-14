// Domain errors of the operations module. Pilot/operator "no assignment"
// cases reuse the fleet errors (PilotHasNoUnitAssigned, OperatorHasNoStation).

import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/domain-exception.filter.js";

export class UnitHasNoLine extends NotFoundError {
  constructor() {
    super("La unidad asignada no tiene una línea asignada.");
    this.name = "UnitHasNoLine";
  }
}

export class AlertNotFound extends NotFoundError {
  constructor(id: string) {
    super(`Alerta con ID ${id} no existe.`);
    this.name = "AlertNotFound";
  }
}

export class DestinationNotOnLine extends ValidationError {
  constructor() {
    super("La estación de destino no pertenece a la línea de la unidad.");
    this.name = "DestinationNotOnLine";
  }
}

export class InvalidAlertTransition extends ConflictError {
  constructor(from: string, to: string) {
    super(`No se puede cambiar la alerta de ${from} a ${to}.`);
    this.name = "InvalidAlertTransition";
  }
}
