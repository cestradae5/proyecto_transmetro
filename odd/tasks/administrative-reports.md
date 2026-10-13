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
- T1 API: `reports` module, pdfkit dependency, 4 PDF endpoints (S3-S6) + unit specs — route: inline — commit: 369ccbc
- T2 API: DB-backed e2e for the report endpoints (S4-S6) — route: inline — commit: see L5
- T3 Web: `/reports` hub, Bitácora moved to `/reports/audit-log`, Reportes administrativos page with download buttons (S1, S2, S4) + tests — route: inline — commit: see L6
- T4 Full verification (api jest + e2e, web vitest, tsc) + independent verify (risk item 5: new dependency) — route: inline fallback (verifier failed) — commit: see L7

## Log
- L1 (user): "Ok necesito que me ayudes con la sigunte tarea, yo no conosco mucho sobre el modulo de reportes en dev, necesito que me ayudes a desarrollar el modulo de reportes, debe de aparecer como un submodulo dentro de reportes, preferiblemente si los reportes se descargan en pdfs."
- L2 (user answers): reports = "Flota: unidades por estado y asignaciones", "Personal: empleados por rol y estado", "Infraestructura: líneas, estaciones y paradas", "Bitácora: resumen por fechas"; PDF = "Backend con pdfkit (recomendado)"; Bitácora = "Sí, /reports es hub con Bitácora + Reportes".
- L3 (evidence): no `dev` branch exists; origin/main already contains the audit log (PR #72). Pre-existing unrelated uncommitted changes (`.atl/*`, `database/seed-current-data.sql`) are not part of this feature.
- L4 (evidence T1): RED 4 suites failed (module missing) -> GREEN `npm test -- reports` 4 suites / 28 tests; full api `npm test` 64 suites / 736 passed; `tsc -p tsconfig.build.json --noEmit` exit 0. Commit 369ccbc.
- L5 (evidence T2): `apps/api/test/reports.e2e-spec.ts` against transmetro_test: 19/19 (401/403 per permission, PDF headers + %PDF magic, real SQL data via renderer spy, 400 without audit row, export_report row). Mutation: dropping the inclusive date-only upper bound -> 1 failed / 18 passed; restored. Leftovers after run: 0 employees/units/lines/stops/municipalities/audit rows.
- L6 (evidence T3): RED 4 files / 10 failed (module + apiClient.download missing) -> GREEN; one fixture fix (jsdom Blob is not readable by native Response; body passed as string). Full web `vitest run` 72 files / 557 passed; web `tsc -b` exit 0; api build tsc exit 0. Removed `src/test/audit-log/audit-log-routes.spec.tsx` (asserted the audit log at /reports, superseded by S2; covered by `src/test/reports/reports-routes.spec.tsx`). API CORS now exposes Content-Disposition so the browser reads the PDF file name.
- L7 (evidence T4): ASSESS (base origin/main, committed) native risk medium; escalated item 5 (pdfkit dependency + permission-gated endpoints) -> high, independent verifier required. gentle-ai-verify failed 2/2 ("assistant reported an error", same runtime failure as audit-log-viewer); fallback inline, NOT independent. Real renderer on compiled build: rows 0/5/40/150 -> pages 1/1/3/8, every page has content (no blank footer-only pages); sample PDF written to a temp dir outside the repo for manual review. Readback: file name built from fixed prefix + validated dates (no header injection); all SQL values bound; render() rejects and destroys on error. Known limits: fleet/personnel/infrastructure queries are unbounded (fine for current data size); accents rely on standard Helvetica WinAnsi.
- L8 (user): "Ya lo vi y esta perfecto, has el pr pero antes has el commit para los archivos pendinetes de la seed" — visual PDF check approved; seed refresh committed separately (c478b75); PR requested.
