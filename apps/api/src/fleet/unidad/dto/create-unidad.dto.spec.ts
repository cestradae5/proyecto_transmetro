import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";

import { CreateUnidadDto } from "./create-unidad.dto.js";
import { EstadoUnidad } from "../unidad.entity.js";

function validPayload(): Record<string, unknown> {
  return {
    numeroPlaca: "AB-12345",
    marca: "Volvo",
    modelo: "B440",
    anio: 2024,
    capacidadPasajeros: 50,
  };
}

describe("CreateUnidadDto validation", () => {
  it("passes validation for a fully valid payload", async () => {
    const dto = plainToInstance(CreateUnidadDto, validPayload());

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it("rejects capacidadPasajeros = 0 (spec: invalid capacity)", async () => {
    const dto = plainToInstance(CreateUnidadDto, {
      ...validPayload(),
      capacidadPasajeros: 0,
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === "capacidadPasajeros")).toBe(true);
  });

  it("rejects negative capacidadPasajeros", async () => {
    const dto = plainToInstance(CreateUnidadDto, {
      ...validPayload(),
      capacidadPasajeros: -5,
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === "capacidadPasajeros")).toBe(true);
  });

  it("rejects a missing required field (numeroPlaca)", async () => {
    const payload = validPayload();
    delete payload.numeroPlaca;
    const dto = plainToInstance(CreateUnidadDto, payload);

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === "numeroPlaca")).toBe(true);
  });

  it("rejects numeroPlaca longer than 20 characters", async () => {
    const dto = plainToInstance(CreateUnidadDto, {
      ...validPayload(),
      numeroPlaca: "A".repeat(21),
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === "numeroPlaca")).toBe(true);
  });

  it("rejects marca longer than 60 characters", async () => {
    const dto = plainToInstance(CreateUnidadDto, {
      ...validPayload(),
      marca: "A".repeat(61),
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === "marca")).toBe(true);
  });

  it("rejects modelo longer than 60 characters", async () => {
    const dto = plainToInstance(CreateUnidadDto, {
      ...validPayload(),
      modelo: "A".repeat(61),
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === "modelo")).toBe(true);
  });

  it("accepts an optional estadoUnidad of DISPONIBLE (allows explicit default on create)", async () => {
    const dto = plainToInstance(CreateUnidadDto, {
      ...validPayload(),
      estadoUnidad: EstadoUnidad.DISPONIBLE,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it("rejects an estadoUnidad that is not a valid enum member", async () => {
    const dto = plainToInstance(CreateUnidadDto, {
      ...validPayload(),
      estadoUnidad: "NOT_A_STATE",
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === "estadoUnidad")).toBe(true);
  });
});
