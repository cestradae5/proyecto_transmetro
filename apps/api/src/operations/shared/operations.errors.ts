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

export class ParadaNotFound extends NotFoundError {
  constructor(id: string) {
    super(`Parada con ID ${id} no existe.`);
    this.name = "ParadaNotFound";
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

// bus-passenger-report S3, S5: pilot stop reports.
export class NoCurrentStop extends ConflictError {
  constructor() {
    super("Reporte primero la parada en la que se encuentra la unidad.");
    this.name = "NoCurrentStop";
  }
}

export class TooManyGettingOff extends ConflictError {
  constructor(bajaron: number, aBordo: number) {
    super(`No pueden bajar ${bajaron} pasajeros: la unidad lleva ${aBordo}.`);
    this.name = "TooManyGettingOff";
  }
}

export class OverCapacity extends ConflictError {
  constructor(aBordo: number, capacidad: number) {
    super(`La unidad quedaría con ${aBordo} pasajeros y su capacidad es ${capacidad}.`);
    this.name = "OverCapacity";
  }
}

export class IdempotencyKeyConflict extends ConflictError {
  constructor() {
    super("La clave de idempotencia ya se usó para otra operación.");
    this.name = "IdempotencyKeyConflict";
  }
}
