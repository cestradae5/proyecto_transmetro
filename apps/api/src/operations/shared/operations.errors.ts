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

// Ridership (odd/tasks/ridership-capacity.md). Every rejection is thrown
// inside the transaction, so nothing is stored or charged.

export class StationNotFound extends NotFoundError {
  constructor(id: string) {
    super(`Estación con ID ${id} no existe.`);
    this.name = "StationNotFound";
  }
}

export class UnitNotFound extends NotFoundError {
  constructor(id: string) {
    super(`Unidad con ID ${id} no existe.`);
    this.name = "UnitNotFound";
  }
}

export class CardNotFound extends NotFoundError {
  constructor() {
    super("La tarjeta no existe.");
    this.name = "CardNotFound";
  }
}

export class CardNotActive extends ConflictError {
  constructor(estado: string) {
    super(`La tarjeta está ${estado} y no puede ingresar.`);
    this.name = "CardNotActive";
  }
}

export class InsufficientBalance extends ConflictError {
  constructor(saldo: number, tarifa: number) {
    super(`Saldo insuficiente: Q${saldo.toFixed(2)} disponible, el pasaje cuesta Q${tarifa.toFixed(2)}.`);
    this.name = "InsufficientBalance";
  }
}

export class UnitAlreadyAtStop extends ConflictError {
  constructor(id: string) {
    super(`La unidad ${id} ya está detenida en una estación; registre su salida primero.`);
    this.name = "UnitAlreadyAtStop";
  }
}

export class UnitNotAtStop extends ConflictError {
  constructor(id: string) {
    super(`La unidad ${id} no está detenida en ninguna estación.`);
    this.name = "UnitNotAtStop";
  }
}

export class IdempotencyKeyConflict extends ConflictError {
  constructor() {
    super("La clave de idempotencia ya se usó para otra operación.");
    this.name = "IdempotencyKeyConflict";
  }
}
