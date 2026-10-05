import { jest } from "@jest/globals";
import type { DataSource } from "typeorm";

import { OperadorEstacionService } from "./operador-estacion.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

describe("OperadorEstacionService", () => {
  let qb: Record<string, AnyMock>;
  let service: OperadorEstacionService;

  beforeEach(() => {
    qb = {};
    for (const m of ["innerJoin", "leftJoin", "select", "addSelect", "where", "andWhere", "orderBy"]) {
      qb[m] = jest.fn(() => qb);
    }
    qb.getRawMany = jest.fn(async () => [
      { idEmpleado: "1", nombre: "Ana", idEstacion: "10" },
      { idEmpleado: "2", nombre: "Beto", idEstacion: null },
    ]);
    const dataSource = { getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => qb) })) };
    service = new OperadorEstacionService(dataSource as unknown as DataSource);
  });

  it("maps rows, omitting idEstacionActual when the operator has no active assignment", async () => {
    const result = await service.listOperators();

    expect(result).toEqual([
      { idEmpleado: "1", nombre: "Ana", idEstacionActual: "10" },
      { idEmpleado: "2", nombre: "Beto" },
    ]);
    expect(result[1]).not.toHaveProperty("idEstacionActual");
  });

  it("filters by the OPERADOR_ESTACION role code and joins only ACTIVA assignments", async () => {
    await service.listOperators();

    expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), {
      roleCode: "OPERADOR_ESTACION",
    });
    expect(qb.leftJoin).toHaveBeenCalledWith(
      expect.anything(),
      "asignacion",
      expect.stringContaining("estadoAsignacion"),
      { activa: "ACTIVA" },
    );
  });
});
