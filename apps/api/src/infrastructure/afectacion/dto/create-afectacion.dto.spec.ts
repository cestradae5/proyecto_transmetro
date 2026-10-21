import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CreateAfectacionDto } from "./create-afectacion.dto.js";

async function errorsOf(input: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateAfectacionDto, input));
  return errors.map((e) => e.property).sort();
}

const valid = { accion: "DESACTIVAR", motivo: "Obra vial", fechaInicio: "2026-10-21", idLinea: "1" };

describe("CreateAfectacionDto", () => {
  it("accepts an action with motivo, dates and one target", async () => {
    expect(await errorsOf({ ...valid, fechaFin: "2026-10-25" })).toEqual([]);
  });

  it("requires accion, motivo and fechaInicio", async () => {
    expect(await errorsOf({ idLinea: "1" })).toEqual(["accion", "fechaInicio", "motivo"]);
  });

  it.each(["TEMPORAL", "MANTENIMIENTO", "activar"])("rejects the action %s", async (accion) => {
    expect(await errorsOf({ ...valid, accion })).toEqual(["accion"]);
  });

  it.each(["", "   "])("rejects the blank motivo %j", async (motivo) => {
    expect(await errorsOf({ ...valid, motivo })).toEqual(["motivo"]);
  });

  it("trims the motivo", async () => {
    expect(plainToInstance(CreateAfectacionDto, { ...valid, motivo: "  Obra vial  " }).motivo).toBe(
      "Obra vial"
    );
  });

  it.each(["fechaInicio", "fechaFin"])("rejects a datetime or invalid %s", async (field) => {
    expect(await errorsOf({ ...valid, [field]: "2026-10-21T15:30:00Z" })).toEqual([field]);
    expect(await errorsOf({ ...valid, [field]: "2026-13-45" })).toEqual([field]);
  });

  it.each(["idLinea", "idParada", "idEstacion"])("rejects a non-numeric %s", async (field) => {
    expect(await errorsOf({ ...valid, idLinea: undefined, [field]: "abc" })).toEqual([field]);
  });
});
