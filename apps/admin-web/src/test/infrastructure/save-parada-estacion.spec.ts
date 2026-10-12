import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isEstacionInUseError,
  saveParadaWithEstacion,
  type ParadaEstacionGateway,
} from "../../features/infrastructure/hooks/save-parada-estacion";
import { ApiError } from "../../lib/api-client";
import type { ParadaFormValues } from "../../features/infrastructure/types/infrastructure.types";

const PARADA_FIELDS = {
  nombreParada: "Parada Central",
  latitud: 14.6,
  longitud: -90.5,
  estadoParada: "ACTIVA",
} as ParadaFormValues["parada"];

const ESTACION_FIELDS = {
  nombreEstacion: "Estación Central",
  latitud: 14.6,
  longitud: -90.5,
  estadoEstacion: "ACTIVA",
} as NonNullable<ParadaFormValues["estacion"]>;

function makeGateway() {
  return {
    // Runtime ids are strings even though Parada.idParada is typed as number.
    createParada: vi.fn().mockResolvedValue({ idParada: "40" }),
    updateParada: vi.fn().mockResolvedValue({ idParada: "7" }),
    createEstacion: vi.fn().mockResolvedValue({ idEstacion: "90" }),
    updateEstacion: vi.fn().mockResolvedValue({ idEstacion: "12" }),
    deleteEstacion: vi.fn().mockResolvedValue(undefined),
    refreshParadas: vi.fn().mockResolvedValue(undefined),
  } satisfies Record<keyof ParadaEstacionGateway, unknown>;
}

describe("saveParadaWithEstacion", () => {
  let gateway: ReturnType<typeof makeGateway>;

  beforeEach(() => {
    gateway = makeGateway();
  });

  const save = (paradaId: number | string | null, values: ParadaFormValues) =>
    saveParadaWithEstacion(paradaId, values, gateway as unknown as ParadaEstacionGateway);

  it("creates only the parada when the toggle is off and there was no estación", async () => {
    await save(null, { parada: PARADA_FIELDS, estacion: null, idEstacion: null });

    expect(gateway.createParada).toHaveBeenCalledWith(PARADA_FIELDS);
    expect(gateway.createEstacion).not.toHaveBeenCalled();
    expect(gateway.deleteEstacion).not.toHaveBeenCalled();
    expect(gateway.refreshParadas).not.toHaveBeenCalled();
  });

  it("creates the parada and then its estación with a numeric idParada", async () => {
    await save(null, { parada: PARADA_FIELDS, estacion: ESTACION_FIELDS, idEstacion: null });

    expect(gateway.createParada).toHaveBeenCalledWith(PARADA_FIELDS);
    expect(gateway.createEstacion).toHaveBeenCalledWith({ ...ESTACION_FIELDS, idParada: 40 });
    expect(gateway.refreshParadas).toHaveBeenCalledTimes(1);
  });

  it("creates an estación for an existing parada that had none", async () => {
    await save("7", { parada: PARADA_FIELDS, estacion: ESTACION_FIELDS, idEstacion: null });

    expect(gateway.updateParada).toHaveBeenCalledWith("7", PARADA_FIELDS);
    expect(gateway.createEstacion).toHaveBeenCalledWith({ ...ESTACION_FIELDS, idParada: 7 });
    expect(gateway.updateEstacion).not.toHaveBeenCalled();
  });

  it("updates the existing estación of a parada", async () => {
    await save("7", { parada: PARADA_FIELDS, estacion: ESTACION_FIELDS, idEstacion: "12" });

    expect(gateway.updateEstacion).toHaveBeenCalledWith("12", ESTACION_FIELDS);
    expect(gateway.createEstacion).not.toHaveBeenCalled();
    expect(gateway.refreshParadas).toHaveBeenCalledTimes(1);
  });

  it("hard-deletes (force) the existing estación when the toggle was turned off", async () => {
    await save("7", { parada: PARADA_FIELDS, estacion: null, idEstacion: "12" });

    expect(gateway.updateParada).toHaveBeenCalledWith("7", PARADA_FIELDS);
    expect(gateway.deleteEstacion).toHaveBeenCalledWith("12", true);
    expect(gateway.refreshParadas).toHaveBeenCalledTimes(1);
  });

  it("propagates a 409 ESTACION_IN_USE after saving the parada and skips the refresh", async () => {
    const conflict = new ApiError(409, "en uso", { error: "ESTACION_IN_USE" });
    gateway.deleteEstacion.mockRejectedValue(conflict);

    await expect(save("7", { parada: PARADA_FIELDS, estacion: null, idEstacion: "12" })).rejects.toBe(conflict);
    expect(gateway.updateParada).toHaveBeenCalledTimes(1);
    expect(gateway.refreshParadas).not.toHaveBeenCalled();
  });
});

describe("isEstacionInUseError", () => {
  it("matches only a 409 ApiError whose error code is ESTACION_IN_USE", () => {
    expect(isEstacionInUseError(new ApiError(409, "x", { error: "ESTACION_IN_USE" }))).toBe(true);
    expect(isEstacionInUseError(new ApiError(409, "x", { error: "PARADA_ALREADY_HAS_ESTACION" }))).toBe(false);
    expect(isEstacionInUseError(new ApiError(500, "x", { error: "ESTACION_IN_USE" }))).toBe(false);
    expect(isEstacionInUseError(new Error("ESTACION_IN_USE"))).toBe(false);
  });
});
