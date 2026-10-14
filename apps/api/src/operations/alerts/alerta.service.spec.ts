import { jest } from "@jest/globals";
import type { DataSource } from "typeorm";

import {
  OperatorHasNoStation,
  PilotHasNoUnitAssigned,
} from "../../fleet/shared/fleet.errors.js";
import {
  AlertNotFound,
  DestinationNotOnLine,
  InvalidAlertTransition,
  UnitHasNoLine,
} from "../shared/operations.errors.js";
import { AlertaService } from "./alerta.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

const UNIT_LINE_ROW = {
  idUnidad: "7",
  numeroPlaca: "P-123ABC",
  idLinea: "3",
  numeroLinea: "12",
  nombreLinea: "Línea 12",
  ordenActual: 4,
};

const STATION_ROWS = [
  { idEstacion: "21", nombreEstacion: "Estación Norte", orden: 1 },
  { idEstacion: "22", nombreEstacion: "Estación Centro", orden: 3 },
  { idEstacion: "23", nombreEstacion: "Estación Sur", orden: 5 },
  { idEstacion: "24", nombreEstacion: "Estación Fuera", orden: null },
];

const ALERT_ROW = {
  idAlerta: "100",
  tipoAlerta: "ACCIDENTE",
  tipoOrigen: "UNIDAD",
  tipoDestino: "ESTACION",
  estadoAlerta: "PENDIENTE",
  fechaCreacion: new Date("2026-10-13T10:00:00.000Z"),
  fechaActualizacion: new Date("2026-10-13T10:00:00.000Z"),
  idUnidad: "7",
  numeroPlaca: "P-123ABC",
  idEstacion: "22",
  nombreEstacion: "Estación Centro",
  idEmpleado: "5",
  nombreEmpleado: "Piloto Uno",
};

const ALERT_DTO = {
  idAlerta: "100",
  tipoAlerta: "ACCIDENTE",
  tipoOrigen: "UNIDAD",
  tipoDestino: "ESTACION",
  estadoAlerta: "PENDIENTE",
  fechaCreacion: "2026-10-13T10:00:00.000Z",
  fechaActualizacion: "2026-10-13T10:00:00.000Z",
  unidad: { idUnidad: "7", numeroPlaca: "P-123ABC" },
  estacionDestino: { idEstacion: "22", nombreEstacion: "Estación Centro" },
  autor: { idEmpleado: "5", nombre: "Piloto Uno" },
  observaciones: [],
};

const STATION_ROW = { idEstacion: "22", nombreEstacion: "Estación Centro" };

describe("AlertaService", () => {
  let query: AnyMock;
  let managerQuery: AnyMock;
  let transaction: AnyMock;
  let service: AlertaService;

  const setup = (results: unknown[][], managerResults: unknown[][] = []) => {
    query = jest.fn();
    for (const rows of results) query.mockResolvedValueOnce(rows);
    managerQuery = jest.fn();
    for (const rows of managerResults) managerQuery.mockResolvedValueOnce(rows);
    transaction = jest.fn(async (cb: (m: unknown) => unknown) => cb({ query: managerQuery }));
    service = new AlertaService({ query, transaction } as unknown as DataSource);
  };

  describe("getDestinations (S2)", () => {
    it("throws PilotHasNoUnitAssigned when the pilot has no unit", async () => {
      setup([[]]);

      await expect(service.getDestinations("5")).rejects.toBeInstanceOf(PilotHasNoUnitAssigned);
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0]![1]).toEqual(["5"]);
    });

    it("throws UnitHasNoLine when the unit has no line assignment", async () => {
      setup([[{ ...UNIT_LINE_ROW, idLinea: null, numeroLinea: null, nombreLinea: null, ordenActual: null }]]);

      await expect(service.getDestinations("5")).rejects.toBeInstanceOf(UnitHasNoLine);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it("lists ACTIVA stations of the unit's line and suggests the closest one, ahead on a tie", async () => {
      setup([[UNIT_LINE_ROW], STATION_ROWS]);

      const result = await service.getDestinations("5");

      expect(query.mock.calls[1]![1]).toEqual(["3", "ACTIVA"]);
      expect(result).toEqual({
        unidad: { idUnidad: "7", numeroPlaca: "P-123ABC" },
        linea: { idLinea: "3", numeroLinea: "12", nombreLinea: "Línea 12" },
        destinations: [
          { idEstacion: "21", nombreEstacion: "Estación Norte", orden: 1, suggested: false },
          { idEstacion: "22", nombreEstacion: "Estación Centro", orden: 3, suggested: false },
          { idEstacion: "23", nombreEstacion: "Estación Sur", orden: 5, suggested: true },
          { idEstacion: "24", nombreEstacion: "Estación Fuera", orden: null, suggested: false },
        ],
      });
    });

    it("suggests the strictly closest station", async () => {
      setup([[{ ...UNIT_LINE_ROW, ordenActual: 2 }], STATION_ROWS.slice(0, 3)]);

      const result = await service.getDestinations("5");

      // |1-2| = 1 and |3-2| = 1 tie -> the one ahead (orden 3).
      expect(result.destinations.filter((d) => d.suggested).map((d) => d.idEstacion)).toEqual(["22"]);

      setup([[{ ...UNIT_LINE_ROW, ordenActual: 1 }], STATION_ROWS.slice(0, 3)]);
      const second = await service.getDestinations("5");
      expect(second.destinations.filter((d) => d.suggested).map((d) => d.idEstacion)).toEqual(["21"]);
    });

    it("suggests the first station when the unit has not reported a stop", async () => {
      setup([[{ ...UNIT_LINE_ROW, ordenActual: null }], STATION_ROWS]);

      const result = await service.getDestinations("5");

      expect(result.destinations.map((d) => d.suggested)).toEqual([true, false, false, false]);
    });

    it("suggests the first station when no station has an orden on the line", async () => {
      setup([
        [UNIT_LINE_ROW],
        [
          { idEstacion: "31", nombreEstacion: "A", orden: null },
          { idEstacion: "32", nombreEstacion: "B", orden: null },
        ],
      ]);

      const result = await service.getDestinations("5");

      expect(result.destinations.map((d) => d.suggested)).toEqual([true, false]);
    });

    it("returns an empty list without suggestion when the line has no stations", async () => {
      setup([[UNIT_LINE_ROW], []]);

      const result = await service.getDestinations("5");

      expect(result.destinations).toEqual([]);
    });
  });

  describe("create (S6)", () => {
    it("inserts a PENDIENTE unit->station alert with the derived unit and the caller as author", async () => {
      setup([[UNIT_LINE_ROW], STATION_ROWS, [{ idAlerta: "100" }], [ALERT_ROW]]);

      const result = await service.create("5", { tipoAlerta: "ACCIDENTE", idEstacionDestino: "22" });

      expect(result).toEqual(ALERT_DTO);
      expect(query).toHaveBeenCalledTimes(4);
      const [insertSql, insertParams] = query.mock.calls[2]!;
      expect(insertSql).toContain("INSERT INTO tbl_alerta");
      expect(insertParams).toEqual(["ACCIDENTE", "UNIDAD", "ESTACION", "PENDIENTE", "7", "22", "5"]);
      expect(query.mock.calls[3]![1]).toEqual(["100"]);
    });

    it("rejects a destination outside the unit's line without inserting", async () => {
      setup([[UNIT_LINE_ROW], STATION_ROWS]);

      await expect(
        service.create("5", { tipoAlerta: "ACCIDENTE", idEstacionDestino: "99" }),
      ).rejects.toBeInstanceOf(DestinationNotOnLine);
      expect(query).toHaveBeenCalledTimes(2);
    });

    it("rejects when the pilot has no unit without inserting", async () => {
      setup([[]]);

      await expect(
        service.create("5", { tipoAlerta: "ACCIDENTE", idEstacionDestino: "22" }),
      ).rejects.toBeInstanceOf(PilotHasNoUnitAssigned);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it("rejects when the unit has no line without inserting", async () => {
      setup([[{ ...UNIT_LINE_ROW, idLinea: null }]]);

      await expect(
        service.create("5", { tipoAlerta: "ACCIDENTE", idEstacionDestino: "22" }),
      ).rejects.toBeInstanceOf(UnitHasNoLine);
      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  describe("observaciones (S15)", () => {
    it("selects the alert's non-blank history observations, oldest first, with their author", async () => {
      setup([[]]);

      await service.listSent("5");

      const [sql] = query.mock.calls[0]!;
      expect(sql).toContain("FROM tbl_historial_estado h");
      expect(sql).toContain("h.id_alerta = a.id_alerta");
      expect(sql).toContain("btrim(h.observacion) <> ''");
      expect(sql).toContain("ORDER BY h.fecha_cambio, h.id_historial_estado");
      expect(sql).toContain(`AS "observaciones"`);
    });

    it("maps observations into every returned alert with ISO dates and string ids", async () => {
      setup([
        [
          {
            ...ALERT_ROW,
            estadoAlerta: "EN_ATENCION",
            observaciones: [
              {
                estadoNuevo: "RECIBIDA",
                observacion: "Unidad en camino",
                fechaCambio: "2026-10-13T04:05:00-06:00",
                idEmpleado: 8,
                nombre: "Operador Uno",
              },
              {
                estadoNuevo: "EN_ATENCION",
                observacion: "Central atiende",
                fechaCambio: "2026-10-13T10:20:00.5+00:00",
                idEmpleado: "1",
                nombre: "Central Uno",
              },
            ],
          },
        ],
      ]);

      const result = await service.listSent("5");

      expect(result).toEqual([
        {
          ...ALERT_DTO,
          estadoAlerta: "EN_ATENCION",
          observaciones: [
            {
              estadoNuevo: "RECIBIDA",
              observacion: "Unidad en camino",
              fechaCambio: "2026-10-13T10:05:00.000Z",
              autor: { idEmpleado: "8", nombre: "Operador Uno" },
            },
            {
              estadoNuevo: "EN_ATENCION",
              observacion: "Central atiende",
              fechaCambio: "2026-10-13T10:20:00.500Z",
              autor: { idEmpleado: "1", nombre: "Central Uno" },
            },
          ],
        },
      ]);
    });
  });

  describe("listSent (S9)", () => {
    it("returns the caller's alerts newest first, max 50", async () => {
      setup([[ALERT_ROW]]);

      const result = await service.listSent("5");

      expect(result).toEqual([ALERT_DTO]);
      const [sql, params] = query.mock.calls[0]!;
      expect(sql).toContain("a.id_empleado = $1");
      expect(sql).toContain("ORDER BY a.fecha_creacion DESC");
      expect(sql).toContain("LIMIT 50");
      expect(params).toEqual(["5"]);
    });
  });

  describe("getMyStation (S7)", () => {
    it("throws OperatorHasNoStation when the operator has no ACTIVA station", async () => {
      setup([[]]);

      await expect(service.getMyStation("8")).rejects.toBeInstanceOf(OperatorHasNoStation);
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0]![1]).toEqual(["8", "ACTIVA"]);
    });

    it("returns only the alerts addressed to the operator's station, newest first, max 100", async () => {
      setup([[STATION_ROW], [ALERT_ROW]]);

      const result = await service.getMyStation("8");

      expect(result).toEqual({
        station: { idEstacion: "22", nombreEstacion: "Estación Centro" },
        alerts: [ALERT_DTO],
      });
      const [sql, params] = query.mock.calls[1]!;
      expect(sql).toContain("a.id_estacion_destino = $1");
      expect(sql).toContain("ORDER BY a.fecha_creacion DESC");
      expect(sql).toContain("LIMIT 100");
      expect(params).toEqual(["22"]);
    });
  });

  describe("updateStatus (S8)", () => {
    const lockedRow = (estadoAlerta: string, idEstacionDestino = "22") => [
      { estadoAlerta, idEstacionDestino },
    ];

    it("advances the state, writes one history row and returns the updated alert", async () => {
      setup(
        [[{ ...ALERT_ROW, estadoAlerta: "RECIBIDA" }]],
        [[STATION_ROW], lockedRow("PENDIENTE"), [], []],
      );

      const result = await service.updateStatus("8", "100", {
        estado: "RECIBIDA",
        observacion: "En camino",
      });

      expect(result).toEqual({ ...ALERT_DTO, estadoAlerta: "RECIBIDA" });
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(managerQuery).toHaveBeenCalledTimes(4);
      expect(managerQuery.mock.calls[0]![1]).toEqual(["8", "ACTIVA"]);
      const [lockSql, lockParams] = managerQuery.mock.calls[1]!;
      expect(lockSql).toContain("FOR UPDATE");
      expect(lockParams).toEqual(["100"]);
      const [updateSql, updateParams] = managerQuery.mock.calls[2]!;
      expect(updateSql).toContain("UPDATE tbl_alerta");
      expect(updateSql).toContain("fecha_actualizacion = CURRENT_TIMESTAMP");
      expect(updateParams).toEqual(["RECIBIDA", "100"]);
      const [historySql, historyParams] = managerQuery.mock.calls[3]!;
      expect(historySql).toContain("INSERT INTO tbl_historial_estado");
      expect(historyParams).toEqual(["PENDIENTE", "RECIBIDA", "En camino", "100", "8"]);
    });

    it("allows skipping forward states and stores a null observation when omitted", async () => {
      setup(
        [[{ ...ALERT_ROW, estadoAlerta: "RESUELTA" }]],
        [[STATION_ROW], lockedRow("PENDIENTE"), [], []],
      );

      await service.updateStatus("8", "100", { estado: "RESUELTA" });

      expect(managerQuery.mock.calls[3]![1]).toEqual(["PENDIENTE", "RESUELTA", null, "100", "8"]);
    });

    it.each([
      ["RECIBIDA", "RECIBIDA"],
      ["EN_ATENCION", "RECIBIDA"],
      ["RESUELTA", "EN_ATENCION"],
      ["RESUELTA", "RESUELTA"],
    ])("rejects %s -> %s with InvalidAlertTransition and writes nothing", async (from, to) => {
      setup([], [[STATION_ROW], lockedRow(from)]);

      await expect(
        service.updateStatus("8", "100", { estado: to as "RECIBIDA" }),
      ).rejects.toBeInstanceOf(InvalidAlertTransition);
      expect(managerQuery).toHaveBeenCalledTimes(2);
      expect(query).not.toHaveBeenCalled();
    });

    it("hides an alert addressed to another station as AlertNotFound", async () => {
      setup([], [[STATION_ROW], lockedRow("PENDIENTE", "23")]);

      await expect(
        service.updateStatus("8", "100", { estado: "RECIBIDA" }),
      ).rejects.toBeInstanceOf(AlertNotFound);
      expect(managerQuery).toHaveBeenCalledTimes(2);
    });

    it("throws AlertNotFound when the alert does not exist", async () => {
      setup([], [[STATION_ROW], []]);

      await expect(
        service.updateStatus("8", "100", { estado: "RECIBIDA" }),
      ).rejects.toBeInstanceOf(AlertNotFound);
      expect(managerQuery).toHaveBeenCalledTimes(2);
    });

    it("throws AlertNotFound for a non-numeric id without querying", async () => {
      setup([], []);

      await expect(
        service.updateStatus("8", "abc", { estado: "RECIBIDA" }),
      ).rejects.toBeInstanceOf(AlertNotFound);
      expect(transaction).not.toHaveBeenCalled();
    });

    it("throws OperatorHasNoStation when the operator has no ACTIVA station", async () => {
      setup([], [[]]);

      await expect(
        service.updateStatus("8", "100", { estado: "RECIBIDA" }),
      ).rejects.toBeInstanceOf(OperatorHasNoStation);
      expect(managerQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe("getCentral (S12, S14)", () => {
    const row = (
      idAlerta: string,
      linea: { idLinea: string; numeroLinea: string; nombreLinea: string } | null,
      idEstacion: string,
      nombreEstacion: string,
      idUnidad: string,
      numeroPlaca: string,
    ) => ({
      ...ALERT_ROW,
      idAlerta,
      idEstacion,
      nombreEstacion,
      idUnidad,
      numeroPlaca,
      idLinea: linea?.idLinea ?? null,
      numeroLinea: linea?.numeroLinea ?? null,
      nombreLinea: linea?.nombreLinea ?? null,
    });
    const L1 = { idLinea: "1", numeroLinea: "1", nombreLinea: "Línea 1" };
    const L12 = { idLinea: "3", numeroLinea: "12", nombreLinea: "Línea 12" };
    const L2 = { idLinea: "2", numeroLinea: "2", nombreLinea: "Línea 2" };
    const dto = (idAlerta: string, idEstacion: string, nombreEstacion: string, idUnidad: string, numeroPlaca: string) => ({
      ...ALERT_DTO,
      idAlerta,
      unidad: { idUnidad, numeroPlaca },
      estacionDestino: { idEstacion, nombreEstacion },
    });

    it("queries the newest 300 unit->station alerts with the unit's current line", async () => {
      setup([[]]);

      await expect(service.getCentral()).resolves.toEqual({ lineas: [] });

      const [sql, params] = query.mock.calls[0]!;
      expect(sql).toContain("tbl_asignacion_unidad");
      expect(sql).toContain("tbl_linea");
      expect(sql).toContain("a.tipo_origen = $1 AND a.tipo_destino = $2");
      expect(sql).toContain("ORDER BY a.fecha_creacion DESC");
      expect(sql).toContain("LIMIT 300");
      expect(params).toEqual(["UNIDAD", "ESTACION"]);
    });

    it("groups line -> station -> unit, sorted, keeping alerts newest first and no-line last", async () => {
      setup([
        [
          row("9", null, "30", "Estación Oeste", "8", "P-999ZZZ"),
          row("8", L12, "22", "Estación Centro", "7", "P-123ABC"),
          row("7", L2, "25", "Estación Sur", "6", "P-500BBB"),
          row("6", L2, "21", "Estación Norte", "5", "P-400AAA"),
          row("5", L2, "25", "Estación Sur", "4", "P-100AAA"),
          row("4", L2, "25", "Estación Sur", "6", "P-500BBB"),
          row("3", L1, "20", "Estación Uno", "3", "P-300CCC"),
        ],
      ]);

      const result = await service.getCentral();

      expect(result).toEqual({
        lineas: [
          {
            ...L1,
            estaciones: [
              {
                idEstacion: "20",
                nombreEstacion: "Estación Uno",
                unidades: [
                  { idUnidad: "3", numeroPlaca: "P-300CCC", alerts: [dto("3", "20", "Estación Uno", "3", "P-300CCC")] },
                ],
              },
            ],
          },
          {
            ...L2,
            estaciones: [
              {
                idEstacion: "21",
                nombreEstacion: "Estación Norte",
                unidades: [
                  { idUnidad: "5", numeroPlaca: "P-400AAA", alerts: [dto("6", "21", "Estación Norte", "5", "P-400AAA")] },
                ],
              },
              {
                idEstacion: "25",
                nombreEstacion: "Estación Sur",
                unidades: [
                  { idUnidad: "4", numeroPlaca: "P-100AAA", alerts: [dto("5", "25", "Estación Sur", "4", "P-100AAA")] },
                  {
                    idUnidad: "6",
                    numeroPlaca: "P-500BBB",
                    alerts: [
                      dto("7", "25", "Estación Sur", "6", "P-500BBB"),
                      dto("4", "25", "Estación Sur", "6", "P-500BBB"),
                    ],
                  },
                ],
              },
            ],
          },
          {
            ...L12,
            estaciones: [
              {
                idEstacion: "22",
                nombreEstacion: "Estación Centro",
                unidades: [
                  { idUnidad: "7", numeroPlaca: "P-123ABC", alerts: [dto("8", "22", "Estación Centro", "7", "P-123ABC")] },
                ],
              },
            ],
          },
          {
            idLinea: null,
            numeroLinea: null,
            nombreLinea: "Sin línea",
            estaciones: [
              {
                idEstacion: "30",
                nombreEstacion: "Estación Oeste",
                unidades: [
                  { idUnidad: "8", numeroPlaca: "P-999ZZZ", alerts: [dto("9", "30", "Estación Oeste", "8", "P-999ZZZ")] },
                ],
              },
            ],
          },
        ],
      });
    });
  });

  describe("updateCentralStatus (S13)", () => {
    const lockedRow = (estadoAlerta: string, idEstacionDestino = "23") => [
      { estadoAlerta, idEstacionDestino },
    ];

    it("advances an alert of any station without a station lookup and writes one history row", async () => {
      setup([[{ ...ALERT_ROW, estadoAlerta: "EN_ATENCION" }]], [lockedRow("PENDIENTE"), [], []]);

      const result = await service.updateCentralStatus("1", "100", {
        estado: "EN_ATENCION",
        observacion: "Central atiende",
      });

      expect(result).toEqual({ ...ALERT_DTO, estadoAlerta: "EN_ATENCION" });
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(managerQuery).toHaveBeenCalledTimes(3);
      const [lockSql, lockParams] = managerQuery.mock.calls[0]!;
      expect(lockSql).toContain("FOR UPDATE");
      expect(lockParams).toEqual(["100"]);
      expect(managerQuery.mock.calls[1]![1]).toEqual(["EN_ATENCION", "100"]);
      const [historySql, historyParams] = managerQuery.mock.calls[2]!;
      expect(historySql).toContain("INSERT INTO tbl_historial_estado");
      expect(historyParams).toEqual(["PENDIENTE", "EN_ATENCION", "Central atiende", "100", "1"]);
    });

    it.each([
      ["RECIBIDA", "RECIBIDA"],
      ["RESUELTA", "EN_ATENCION"],
    ])("rejects %s -> %s with InvalidAlertTransition and writes nothing", async (from, to) => {
      setup([], [lockedRow(from)]);

      await expect(
        service.updateCentralStatus("1", "100", { estado: to as "RECIBIDA" }),
      ).rejects.toBeInstanceOf(InvalidAlertTransition);
      expect(managerQuery).toHaveBeenCalledTimes(1);
      expect(query).not.toHaveBeenCalled();
    });

    it("throws AlertNotFound when the alert does not exist", async () => {
      setup([], [[]]);

      await expect(
        service.updateCentralStatus("1", "100", { estado: "RECIBIDA" }),
      ).rejects.toBeInstanceOf(AlertNotFound);
      expect(managerQuery).toHaveBeenCalledTimes(1);
    });

    it("throws AlertNotFound for a non-numeric id without querying", async () => {
      setup([], []);

      await expect(
        service.updateCentralStatus("1", "abc", { estado: "RECIBIDA" }),
      ).rejects.toBeInstanceOf(AlertNotFound);
      expect(transaction).not.toHaveBeenCalled();
    });
  });
});
