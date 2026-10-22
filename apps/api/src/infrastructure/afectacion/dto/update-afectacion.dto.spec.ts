import { ValidationPipe } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { UpdateAfectacionDto } from "./update-afectacion.dto.js";

async function errorsOf(input: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(UpdateAfectacionDto, input));
  return errors.map((e) => e.property).sort();
}

describe("UpdateAfectacionDto", () => {
  it("accepts an empty body and every editable field", async () => {
    expect(await errorsOf({})).toEqual([]);
    expect(
      await errorsOf({ accion: "ACTIVAR", motivo: "Fin", fechaInicio: "2026-10-21", fechaFin: "2026-10-25" })
    ).toEqual([]);
  });

  it("accepts fechaFin null (clears it)", async () => {
    expect(await errorsOf({ fechaFin: null })).toEqual([]);
  });

  it.each(["accion", "motivo", "fechaInicio"])("rejects %s null", async (field) => {
    expect(await errorsOf({ [field]: null })).toEqual([field]);
  });

  it("rejects a legacy accion, a blank motivo and datetimes", async () => {
    expect(await errorsOf({ accion: "TEMPORAL" })).toEqual(["accion"]);
    expect(await errorsOf({ motivo: "   " })).toEqual(["motivo"]);
    expect(await errorsOf({ fechaInicio: "2026-10-21T10:00:00Z", fechaFin: "2026-13-01" })).toEqual([
      "fechaFin",
      "fechaInicio",
    ]);
  });

  it("strips target fields under the app's whitelist pipe", async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });

    const dto = (await pipe.transform(
      { motivo: "Fin", idLinea: "1", idMunicipalidad: "2", idParada: "3", idEstacion: "4" },
      { type: "body", metatype: UpdateAfectacionDto }
    )) as Record<string, unknown>;

    expect(dto).toEqual({ motivo: "Fin" });
  });
});
