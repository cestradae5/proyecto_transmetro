// Domain errors of the public citizen endpoints (odd/tasks/user-web.md).
// Every rejection is thrown inside the transaction, so nothing is stored.

import { ConflictError, NotFoundError } from "../shared/errors/domain-exception.filter.js";

export class CitizenCardNotFound extends NotFoundError {
  constructor() {
    super("La tarjeta no existe.");
    this.name = "CitizenCardNotFound";
  }
}

export class CardCannotBeRecharged extends ConflictError {
  constructor(estado: string) {
    super(`La tarjeta está ${estado} y no puede recargarse.`);
    this.name = "CardCannotBeRecharged";
  }
}

export class RechargeReferenceConflict extends ConflictError {
  constructor() {
    super("La referencia ya se usó para otra recarga.");
    this.name = "RechargeReferenceConflict";
  }
}
