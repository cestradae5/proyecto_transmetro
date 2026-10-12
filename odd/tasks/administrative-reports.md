# Administrative reports (Reportes administrativos, PDF)

Turn `/reports` into a hub with two submodules (Bitácora + Reportes administrativos) and add four administrative reports downloadable as PDF, generated server-side with `pdfkit`.
Branch: `feat/administrative-reports` (from origin/main @ 0e64704).

## Specs
- S1 (user, L1): "necesito que me ayudes a desarrollar el modulo de reportes, debe de aparecer como un submodulo dentro de reportes, preferiblemente si los reportes se descargan en pdfs."
- S2 (user, L2): "Sí, /reports es hub con Bitácora + Reportes". The existing audit log moves to `/reports/audit-log`; `/reports` shows one card per submodule the user is allowed to use.
- S3 (user, L2): "Backend con pdfkit (recomendado)": a NestJS endpoint returns `application/pdf` as an attachment.
- S4 (user, L2): all four reports:
  - S4a "Flota: unidades por estado y asignaciones" — units grouped by state with assigned line and pilot.
  - S4b "Personal: empleados por rol y estado" — employees grouped by role with state.
  - S4c "Infraestructura: líneas, estaciones y paradas" — lines with their stops/stations and municipalities.
  - S4d "Bitácora: resumen por fechas" — audit actions per module/user within a date range (`from`, `to`).
- S5 (orchestrator decision): S4a-S4c require `REPORTES_ADMINISTRATIVOS_CONSULTAR`; S4d requires `AUDITORIA_BITACORA_CONSULTAR`. Missing permission -> 403; no token -> 401. Each successful download writes one `tbl_bitacora` row (module `reports`, action `export_report`).
- S6 (orchestrator decision): invalid S4d range (`from` after `to`, malformed date) -> 400 and no audit row.

## Tasks
- T1 API: `reports` module, pdfkit dependency, 4 PDF endpoints (S3-S6) + unit specs — route: inline — commit: pending
- T2 API: DB-backed e2e for the report endpoints (S4-S6) — route: inline — commit: pending
- T3 Web: `/reports` hub, Bitácora moved to `/reports/audit-log`, Reportes administrativos page with download buttons (S1, S2, S4) + tests — route: inline — commit: pending
- T4 Full verification (api jest + e2e, web vitest, tsc) + independent verify (risk item 5: new dependency) — commit: pending

## Log
- L1 (user): "Ok necesito que me ayudes con la sigunte tarea, yo no conosco mucho sobre el modulo de reportes en dev, necesito que me ayudes a desarrollar el modulo de reportes, debe de aparecer como un submodulo dentro de reportes, preferiblemente si los reportes se descargan en pdfs."
- L2 (user answers): reports = "Flota: unidades por estado y asignaciones", "Personal: empleados por rol y estado", "Infraestructura: líneas, estaciones y paradas", "Bitácora: resumen por fechas"; PDF = "Backend con pdfkit (recomendado)"; Bitácora = "Sí, /reports es hub con Bitácora + Reportes".
- L3 (evidence): no `dev` branch exists; origin/main already contains the audit log (PR #72). Pre-existing unrelated uncommitted changes (`.atl/*`, `database/seed-current-data.sql`) are not part of this feature.
