import { jest } from "@jest/globals";
import { QueryFailedError, type DataSource } from "typeorm";

import { IdempotencyKeyConflict } from "../shared/operations.errors.js";
import { RidershipService } from "./ridership.service.js";

/** The error TypeORM raises when Postgres rejects an insert on a UNIQUE. */
function uniqueViolation(constraint: string): QueryFailedError {
  return new QueryFailedError("INSERT", [], Object.assign(new Error("duplicate"), { code: "23505", constraint }));
}

describe("RidershipService.registerPass unique violations (user-web S7)", () => {
  const failWith = (error: Error) =>
    new RidershipService({ transaction: jest.fn(async () => Promise.reject(error)) } as unknown as DataSource);
  const dto = { numeroTarjeta: "CARD", idParada: 1, tipo: "ENTRADA" as const, idempotencyKey: "key-12345" };

  it("maps a race on clave_idempotencia to IdempotencyKeyConflict (409)", async () => {
    const service = failWith(uniqueViolation("tbl_evento_talanquera_clave_idempotencia_key"));

    await expect(service.registerPass(dto)).rejects.toBeInstanceOf(IdempotencyKeyConflict);
  });

  it("rethrows a violation of another constraint unchanged", async () => {
    const error = uniqueViolation("idx_parada_unidad_abierta");

    await expect(failWith(error).registerPass(dto)).rejects.toBe(error);
  });
});
