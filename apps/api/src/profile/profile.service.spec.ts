import { jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import type { DataSource } from "typeorm";

import { ProfileService } from "./profile.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

const employeeRow = (roleCode: string, roleName: string) => ({
  employeeId: "5",
  name: "Ana Perez",
  email: "ana@transmetro.gt",
  roleName,
  roleCode,
});

describe("ProfileService", () => {
  let query: AnyMock;
  let service: ProfileService;

  const setup = (results: unknown[][]) => {
    query = jest.fn();
    for (const rows of results) {
      query.mockResolvedValueOnce(rows);
    }
    service = new ProfileService({ query } as unknown as DataSource);
  };

  it("returns the ACTIVA station for a station operator", async () => {
    setup([
      [employeeRow("OPERADOR_ESTACION", "Operador de estación")],
      [{ idEstacion: 10, nombreEstacion: "Central" }],
    ]);

    const result = await service.getProfile("5");

    expect(result).toEqual({
      employeeId: "5",
      name: "Ana Perez",
      email: "ana@transmetro.gt",
      role: { code: "OPERADOR_ESTACION", name: "Operador de estación" },
      station: { idEstacion: "10", nombreEstacion: "Central" },
    });
    expect(result).not.toHaveProperty("line");
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]![1]).toEqual(["5", "ACTIVA"]);
  });

  it("omits station when the operator has no ACTIVA assignment", async () => {
    setup([[employeeRow("OPERADOR_ESTACION", "Operador de estación")], []]);

    const result = await service.getProfile("5");

    expect(result).not.toHaveProperty("station");
    expect(result).not.toHaveProperty("line");
  });

  it("returns the line for a pilot and never a station", async () => {
    setup([
      [employeeRow("PILOTO", "Piloto")],
      [{ idLinea: 3, numeroLinea: "L1", nombreLinea: "Linea Norte", colorHex: "#FF0000" }],
    ]);

    const result = await service.getProfile("5");

    expect(result.line).toEqual({
      idLinea: "3",
      numeroLinea: "L1",
      nombreLinea: "Linea Norte",
      colorHex: "#FF0000",
    });
    expect(result).not.toHaveProperty("station");
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]![1]).toEqual(["5"]);
  });

  it("returns the license number for a pilot only", async () => {
    setup([[{ ...employeeRow("PILOTO", "Piloto"), licenseNumber: "LIC-123" }], []]);
    expect((await service.getProfile("5")).licenseNumber).toBe("LIC-123");

    setup([[{ ...employeeRow("OPERADOR_ESTACION", "Operador"), licenseNumber: "LIC-9" }], []]);
    expect(await service.getProfile("5")).not.toHaveProperty("licenseNumber");
  });

  it("returns null license when the pilot has none registered", async () => {
    setup([[employeeRow("PILOTO", "Piloto")], []]);
    expect((await service.getProfile("5")).licenseNumber).toBeNull();
  });

  it("omits line when the pilot has no unit or line assigned", async () => {
    setup([[employeeRow("PILOTO", "Piloto")], []]);

    const result = await service.getProfile("5");

    expect(result).not.toHaveProperty("line");
    expect(result).not.toHaveProperty("station");
  });

  it("does not query assignments for other roles", async () => {
    setup([[employeeRow("OPERADOR_CENTRAL", "Operador central")]]);

    const result = await service.getProfile("5");

    expect(result.role).toEqual({ code: "OPERADOR_CENTRAL", name: "Operador central" });
    expect(result).not.toHaveProperty("station");
    expect(result).not.toHaveProperty("line");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("throws NotFoundException when the employee does not exist", async () => {
    setup([[]]);

    await expect(service.getProfile("99")).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
