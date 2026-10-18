import { jest } from "@jest/globals";
import { QueryFailedError, type DataSource } from "typeorm";

import { RechargeReferenceConflict } from "./citizen.errors.js";
import { CitizenService } from "./citizen.service.js";

/** The error TypeORM raises when Postgres rejects an insert on a UNIQUE. */
function uniqueViolation(constraint: string): QueryFailedError {
  return new QueryFailedError("INSERT", [], Object.assign(new Error("duplicate"), { code: "23505", constraint }));
}

describe("CitizenService.recharge unique violations (user-web S6)", () => {
  const failWith = (error: Error) =>
    new CitizenService({ transaction: jest.fn(async () => Promise.reject(error)) } as unknown as DataSource);
  const dto = { monto: 10, referencia: "ref-12345" };

  it("maps a race on referencia_pago to RechargeReferenceConflict (409)", async () => {
    const service = failWith(uniqueViolation("tbl_transaccion_pago_referencia_pago_key"));

    await expect(service.recharge("CARD", dto)).rejects.toBeInstanceOf(RechargeReferenceConflict);
  });

  it.each(["tbl_comprobante_numero_comprobante_key", "tbl_transaccion_pago_id_transaccion_qpaypro_key"])(
    "rethrows a violation of %s unchanged instead of blaming the referencia",
    async (constraint) => {
      const error = uniqueViolation(constraint);

      await expect(failWith(error).recharge("CARD", dto)).rejects.toBe(error);
    },
  );
});
