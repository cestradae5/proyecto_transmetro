import { jest } from "@jest/globals";
import type { DataSource } from "typeorm";

import { ParadaNotFound } from "../shared/operations.errors.js";
import { RidershipService } from "./ridership.service.js";

// odd/tasks/parada-ridership.md S5, S6: count, capacity and alert belong to the parada.
describe("RidershipService by parada (parada-ridership S5, S6)", () => {
  function serviceWith(answers: (sql: string) => unknown) {
    const calls: { sql: string; params?: unknown[] }[] = [];
    const query = jest.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return answers(sql);
    });
    const dataSource = { transaction: jest.fn(async (fn: (m: unknown) => unknown) => fn({ query })), query };
    return { service: new RidershipService(dataSource as unknown as DataSource), calls };
  }

  it("locks only the parada row and stores id_estacion_origen NULL for a plain parada at 150%", async () => {
    const { service, calls } = serviceWith((sql) => {
      if (sql.includes("FROM tbl_parada p")) return [{ idParada: "7", nombreParada: "A", capacidadPasajeros: 4, idEstacion: null }];
      if (sql.includes("FROM tbl_tarjeta_ciudadana")) return [{ idTarjeta: "1", saldo: "10.00", estado: "ACTIVA" }];
      if (sql.startsWith("UPDATE tbl_tarjeta_ciudadana")) return [[{ saldo: "9.00" }], 1];
      if (sql.includes("INSERT INTO tbl_evento_talanquera")) return [{ idEvento: "1" }];
      if (sql.includes("GREATEST")) return [{ people: 6 }];
      if (sql.includes("INSERT INTO tbl_alerta")) return [{ idAlerta: "9" }];
      return [];
    });

    const pass = await service.registerPass({ numeroTarjeta: "C", idParada: 7, tipo: "ENTRADA" });

    expect(calls.find((c) => c.sql.includes("FROM tbl_parada p"))!.sql).toContain("FOR UPDATE OF p");
    expect(calls.find((c) => c.sql.includes("INSERT INTO tbl_alerta"))!.params!.slice(3)).toEqual(["7", null]);
    expect(pass.parada).toMatchObject({ idParada: "7", idEstacion: null, capacidadPasajeros: 4, personasEnParada: 6, alertaActiva: true });
    expect(pass.alertaGenerada).toBe(true);
  });

  it.each(["abc", "1.5", ""])("rejects parada id %p with ParadaNotFound", async (id) => {
    const { service } = serviceWith(() => []);

    await expect(service.getParada(id)).rejects.toThrow(new ParadaNotFound(id).message);
    expect(new ParadaNotFound("999").message).toBe("Parada con ID 999 no existe.");
  });
});
