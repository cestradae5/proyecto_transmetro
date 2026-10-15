# Operational alerts in the audit log and reports

Branch `feat/alert-audit-reports`, stacked on `feat/alert-line-scoping` (PR #76): it uses the line stored on each alert (`tbl_alerta.id_linea`).
Alerts write audit-log rows and get their own date-range PDF report.

## Specs
- S1 (user, verbatim): "necesito que las alertas tambien aparescan en la bitacora y en reportes"
- S2 Audit log (user chose "Envío y cada cambio de estado"): every successful `POST /operations/alerts` writes one `tbl_bitacora` row (module `operations`, action `send_alert`, entity `alerta` + id, result `EXITOSO`, author = the pilot) in the same transaction as the insert. `detalle`: `tipoAlerta`, `estado` `PENDIENTE`, `idUnidad`, `numeroPlaca`, `idEstacionDestino`, `nombreEstacion`, `idLinea`, `numeroLinea`.
- S3 Every successful state change (station `PATCH :id/status` and central `PATCH central/:id/status`) writes one row (action `update_alert_status`, entity `alerta` + id, author = the caller) in the same transaction as the update and history row. `detalle`: `estadoAnterior`, `estadoNuevo`, `observacion` (or `null`), `vista` (`estacion` | `central`). A rejected request (400/404/409) writes no row.
- S4 The audit log viewer labels module `operations` as "Operaciones"; its filter options already come from the stored values.
- S5 Report (user chose "Resumen + detalle por rango"): `GET /reports/alerts?from=YYYY-MM-DD&to=YYYY-MM-DD` returns a PDF of the unit -> station alerts created in the range (both days included). Same range validation as `reports/audit-log` (400). Contents:
  - summary: total alerts and the count per state (Pendiente, Recibida, En atención, Resuelta);
  - "Alertas por tipo": type (Spanish label) and count;
  - "Alertas por línea y estación": line (stored line, "Sin línea" last), station, total, pending (`PENDIENTE`), resolved (`RESUELTA`);
  - "Detalle de alertas": date, type, line, station, unit, pilot, state, newest first, at most 500 rows; when more, a note says how many are shown out of the total.
  File name `reporte-alertas-<from>_<to>.pdf`. Each export writes the usual `reports`/`export_report` audit row with `{ report: "alerts", from, to }`.
- S6 Permission (user chose): `REPORTES_ADMINISTRATIVOS_CONSULTAR`, like the fleet, personnel and infrastructure reports.
- S7 Web: "Reportes administrativos" shows an "Alertas operativas" card for users with `REPORTES_ADMINISTRATIVOS_CONSULTAR`, with its own "Desde"/"Hasta" range (independent of the audit-log card's range) and the same validation.

## Tasks
- [ ] T1 [S2, S3] API: audit rows for send and state changes, specs, operations README — route: inline — commit:
- [ ] T2 [S5, S6] API: alerts report, labels, controller, specs, reports e2e — route: inline — commit:
- [ ] T3 [S2, S3] e2e: audit rows in `operational-alerts` e2e against `transmetro_test` — route: inline — commit:
- [ ] T4 [S4, S7] Web: "Operaciones" module label, alerts report card, tests, README — route: inline — commit:
- [ ] T5 [all] Full checks — route: inline — commit: n/a

## Log
- L1 (user): "necesito que las alertas tambien aparescan en la bitacora y en reportes"
- L2 (user answers): bitácora "Envío y cada cambio de estado (Recomendado)"; report "Resumen + detalle por rango (Recomendado)"; permission "REPORTES_ADMINISTRATIVOS_CONSULTAR (Recomendado)".
- L3 (decision): `AlertaService` is raw SQL on the shared DataSource, so the audit row is a parameterized `INSERT INTO tbl_bitacora` on the same transaction manager (no TypeORM entity load), keeping send/transition and audit atomic.
