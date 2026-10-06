import { jest } from "@jest/globals";
import type { DataSource } from "typeorm";

import { OperatorHasNoStation } from "../shared/fleet.errors.js";
import { EstacionOperadorService } from "./estacion-operador.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

const STATION_ROW = {
  idEstacion: "10",
  nombreEstacion: "Central",
  estadoEstacion: "ACTIVA",
  latitud: "14.60000000",
  longitud: "-90.50000000",
  idParada: "100",
  nombreParadaEstacion: "Parada Central",
};

describe("EstacionOperadorService", () => {
  let query: AnyMock;
  let service: EstacionOperadorService;

  const setup = (results: unknown[][]) => {
    query = jest.fn();
    for (const rows of results) {
      query.mockResolvedValueOnce(rows);
    }
    service = new EstacionOperadorService({ query } as unknown as DataSource);
  };

  it("throws OperatorHasNoStation when the operator has no ACTIVA assignment", async () => {
    setup([[]]);

    await expect(service.getMyStation("5")).rejects.toBeInstanceOf(OperatorHasNoStation);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![1]).toEqual(["5", "ACTIVA"]);
  });

  it("returns an empty lines/units payload when the station has no ACTIVA lines", async () => {
    setup([[STATION_ROW], []]);

    const result = await service.getMyStation("5");

    expect(result.station).toEqual({
      idEstacion: "10",
      nombreEstacion: "Central",
      estadoEstacion: "ACTIVA",
      latitud: 14.6,
      longitud: -90.5,
      parada: { idParada: "100", nombreParada: "Parada Central" },
    });
    expect(result.lines).toEqual([]);
    expect(result.units).toEqual([]);
    // No units query is issued without lines.
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("omits parada when the station has no linked stop", async () => {
    setup([[{ ...STATION_ROW, idParada: null, nombreParadaEstacion: null }], []]);

    const result = await service.getMyStation("5");

    expect(result.station).not.toHaveProperty("parada");
  });

  it("groups stops by line in order and flags the station stop; only ACTIVA links are queried", async () => {
    const line = {
      idLinea: "1",
      numeroLinea: "L1",
      nombreLinea: "Linea 1",
      colorHex: "#FF0000",
      estadoLinea: "ACTIVA",
      tipoPunto: "PRINCIPAL",
    };
    setup([
      [STATION_ROW],
      [
        { ...line, idLineaParada: "11", orden: 1, idParada: "100", nombreParada: "Parada Central" },
        { ...line, idLineaParada: "12", orden: 2, idParada: "101", nombreParada: "Parada B" },
        {
          ...line,
          idLinea: "2",
          numeroLinea: "L2",
          idLineaParada: null,
          orden: null,
          idParada: null,
          nombreParada: null,
        },
      ],
      [],
    ]);

    const result = await service.getMyStation("5");

    expect(query.mock.calls[1]![1]).toEqual(["10", "ACTIVA"]);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]!.stops).toEqual([
      { idLineaParada: "11", orden: 1, idParada: "100", nombreParada: "Parada Central", isStationStop: true },
      { idLineaParada: "12", orden: 2, idParada: "101", nombreParada: "Parada B", isStationStop: false },
    ]);
    expect(result.lines[1]!.stops).toEqual([]);
    expect(query.mock.calls[2]![1]).toEqual([["1", "2"]]);
  });

  it("maps units with position and pilot flag, omitting absent position fields", async () => {
    const reportedAt = new Date("2026-01-01T10:00:00Z");
    setup([
      [STATION_ROW],
      [
        {
          idLinea: "1",
          numeroLinea: "L1",
          nombreLinea: "Linea 1",
          colorHex: "#FF0000",
          estadoLinea: "ACTIVA",
          tipoPunto: "PRINCIPAL",
          idLineaParada: null,
          orden: null,
          idParada: null,
          nombreParada: null,
        },
      ],
      [
        {
          idUnidad: "7",
          numeroPlaca: "P-123",
          estadoUnidad: "EN_SERVICIO",
          idLinea: "1",
          idLineaParadaActual: "11",
          nombreParadaActual: "Parada Central",
          fechaReporteUbicacion: reportedAt,
          pilotAssigned: true,
          nombrePiloto: "Juan Pérez",
        },
        {
          idUnidad: "8",
          numeroPlaca: "P-456",
          estadoUnidad: "DISPONIBLE",
          idLinea: "1",
          idLineaParadaActual: null,
          nombreParadaActual: null,
          fechaReporteUbicacion: null,
          pilotAssigned: false,
          nombrePiloto: null,
        },
      ],
    ]);

    const { units } = await service.getMyStation("5");

    expect(units[0]).toEqual({
      idUnidad: "7",
      numeroPlaca: "P-123",
      estadoUnidad: "EN_SERVICIO",
      idLinea: "1",
      idLineaParadaActual: "11",
      nombreParadaActual: "Parada Central",
      fechaReporteUbicacion: reportedAt,
      pilotAssigned: true,
      nombrePiloto: "Juan Pérez",
    });
    expect(units[1]).toEqual({
      idUnidad: "8",
      numeroPlaca: "P-456",
      estadoUnidad: "DISPONIBLE",
      idLinea: "1",
      pilotAssigned: false,
    });
  });
});
