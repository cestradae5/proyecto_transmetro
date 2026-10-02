// PilotoService tests (mocked query builder): row mapping and query filters.

import { jest } from "@jest/globals";
import type { DataSource } from "typeorm";

import {
  EMPLOYEE_STATUSES,
  EmployeeEntity,
} from "../../authentication/entities/employee.entity.js";
import { AsignacionPilotoEntity } from "../asignacion-piloto/asignacion-piloto.entity.js";
import { ROLE_CODES } from "../shared/fleet.constants.js";
import { PilotoService } from "./piloto.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

describe("PilotoService.listEligiblePilots", () => {
  let qb: Record<
    "innerJoin" | "leftJoin" | "select" | "addSelect" | "where" | "andWhere" | "orderBy" | "getRawMany",
    AnyMock
  >;
  let getRepository: AnyMock;
  let service: PilotoService;

  beforeEach(() => {
    qb = {
      innerJoin: jest.fn(),
      leftJoin: jest.fn(),
      select: jest.fn(),
      addSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      getRawMany: jest.fn(async () => []),
    };
    for (const key of ["innerJoin", "leftJoin", "select", "addSelect", "where", "andWhere", "orderBy"] as const) {
      qb[key]!.mockReturnValue(qb);
    }
    getRepository = jest.fn(() => ({ createQueryBuilder: jest.fn(() => qb) }));
    service = new PilotoService({ getRepository } as unknown as DataSource);
  });

  it("maps rows, including pilots with and without an assigned unit", async () => {
    qb.getRawMany.mockResolvedValue([
      { idEmpleado: "3", nombre: "Ana", idUnidad: "9" },
      { idEmpleado: "4", nombre: "Beto", idUnidad: null },
    ]);

    const result = await service.listEligiblePilots();

    expect(result).toEqual([
      { idEmpleado: "3", nombre: "Ana", idUnidad: "9" },
      { idEmpleado: "4", nombre: "Beto" },
    ]);
    expect("idUnidad" in result[1]!).toBe(false);
  });

  it("returns an empty list when there are no eligible pilots", async () => {
    expect(await service.listEligiblePilots()).toEqual([]);
  });

  it("queries employees only, in a single query", async () => {
    await service.listEligiblePilots();

    expect(getRepository).toHaveBeenCalledTimes(1);
    expect(getRepository).toHaveBeenCalledWith(EmployeeEntity);
    expect(qb.getRawMany).toHaveBeenCalledTimes(1);
  });

  it("left-joins the pilot assignment on the employee id", async () => {
    await service.listEligiblePilots();

    expect(qb.leftJoin).toHaveBeenCalledWith(
      AsignacionPilotoEntity,
      "asignacion",
      "asignacion.idEmpleado = employee.id",
    );
  });

  it("filters to ACTIVE employees with the PILOTO role", async () => {
    await service.listEligiblePilots();

    expect(qb.where).toHaveBeenCalledWith("employee.status = :status", {
      status: EMPLOYEE_STATUSES.ACTIVE,
    });
    expect(qb.andWhere).toHaveBeenCalledWith("role.code = :roleCode", {
      roleCode: ROLE_CODES.PILOTO,
    });
  });

  it("orders by name and selects only id, name and unit (no email)", async () => {
    await service.listEligiblePilots();

    expect(qb.orderBy).toHaveBeenCalledWith("employee.name", "ASC");
    const selected = [...qb.select.mock.calls, ...qb.addSelect.mock.calls].map((c) => c[0]);
    expect(selected).toEqual(["employee.id", "employee.name", "asignacion.idUnidad"]);
  });
});
