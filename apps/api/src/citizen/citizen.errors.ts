// Domain errors of the public citizen endpoints (odd/tasks/user-web.md).
// Every rejection is thrown inside the transaction, so nothing is stored.

import { BadGatewayException, ServiceUnavailableException } from "@nestjs/common";

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

// qpaypro-checkout S2: a QPayPro setting is missing.
export class QpayproUnavailable extends ServiceUnavailableException {
  constructor() {
    super("Los pagos con QPayPro no están disponibles.");
  }
}

// qpaypro-checkout S3: QPayPro did not hand out a checkout token.
export class QpayproStartFailed extends BadGatewayException {
  constructor() {
    super("No se pudo iniciar el pago con QPayPro.");
  }
}

// qpaypro-checkout S6
export class PaymentNotFound extends NotFoundError {
  constructor() {
    super("El pago no existe.");
    this.name = "PaymentNotFound";
  }
}
