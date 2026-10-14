import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CreateAlertaDto } from "./create-alerta.dto.js";
import { UpdateAlertaStatusDto } from "./update-alerta-status.dto.js";

async function errorsOf<T extends object>(
  cls: new () => T,
  input: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, input));
  return errors.map((e) => e.property).sort();
}

describe("CreateAlertaDto (S3, S6)", () => {
  it.each([
    "ACCIDENTE",
    "FALLA_MECANICA",
    "EMERGENCIA_MEDICA",
    "INCIDENTE_SEGURIDAD",
    "RETRASO",
    "UNIDAD_LLENA",
  ])("accepts the catalog type %s", async (tipoAlerta) => {
    expect(await errorsOf(CreateAlertaDto, { tipoAlerta, idEstacionDestino: "22" })).toEqual([]);
  });

  it.each(["OTRO", "accidente", "", 5])("rejects the type %p", async (tipoAlerta) => {
    expect(await errorsOf(CreateAlertaDto, { tipoAlerta, idEstacionDestino: "22" })).toEqual([
      "tipoAlerta",
    ]);
  });

  it.each(["", "abc", "1.5", "-3", 22])("rejects the destination %p", async (idEstacionDestino) => {
    expect(
      await errorsOf(CreateAlertaDto, { tipoAlerta: "ACCIDENTE", idEstacionDestino }),
    ).toEqual(["idEstacionDestino"]);
  });

  it("requires both fields", async () => {
    expect(await errorsOf(CreateAlertaDto, {})).toEqual(["idEstacionDestino", "tipoAlerta"]);
  });
});

describe("UpdateAlertaStatusDto (S8)", () => {
  it.each(["RECIBIDA", "EN_ATENCION", "RESUELTA"])("accepts the target state %s", async (estado) => {
    expect(await errorsOf(UpdateAlertaStatusDto, { estado })).toEqual([]);
  });

  it.each(["PENDIENTE", "CERRADA", ""])("rejects the target state %p", async (estado) => {
    expect(await errorsOf(UpdateAlertaStatusDto, { estado })).toEqual(["estado"]);
  });

  it("accepts an observation of 500 characters and rejects 501", async () => {
    expect(
      await errorsOf(UpdateAlertaStatusDto, { estado: "RECIBIDA", observacion: "x".repeat(500) }),
    ).toEqual([]);
    expect(
      await errorsOf(UpdateAlertaStatusDto, { estado: "RECIBIDA", observacion: "x".repeat(501) }),
    ).toEqual(["observacion"]);
  });

  it("rejects a non-string observation", async () => {
    expect(await errorsOf(UpdateAlertaStatusDto, { estado: "RECIBIDA", observacion: 3 })).toEqual([
      "observacion",
    ]);
  });
});
