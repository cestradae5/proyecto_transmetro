import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getMetadataArgsStorage } from "typeorm";

import { EmployeeEntity } from "./employee.entity.js";

const EXPECTED_COLUMNS = [
  { property: "phone", name: "telefono_emple", sql: "telefono_emple VARCHAR(20)" },
  { property: "dpi", name: "dpi_emple", sql: "dpi_emple VARCHAR(13)" },
  { property: "hireDate", name: "fecha_ingreso_emple", sql: "fecha_ingreso_emple DATE" },
  { property: "address", name: "direccion_emple", sql: "direccion_emple VARCHAR(255)" },
  { property: "licenseNumber", name: "licencia_emple", sql: "licencia_emple VARCHAR(30)" },
  { property: "educationHistory", name: "historial_educativo_emple", sql: "historial_educativo_emple TEXT" },
  { property: "languages", name: "idiomas_emple", sql: "idiomas_emple TEXT" },
] as const;

// Resolved from this spec: apps/api/src/authentication/entities -> repo root.
const INIT_SQL = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../../database/init.sql",
);

describe("EmployeeEntity profile columns", () => {
  const columns = getMetadataArgsStorage().columns.filter(
    (column) => column.target === EmployeeEntity,
  );

  it.each(EXPECTED_COLUMNS)(
    "maps $property to $name as nullable",
    ({ property, name }) => {
      const column = columns.find((c) => c.propertyName === property);

      expect(column).toBeDefined();
      expect(column?.options.name).toBe(name);
      expect(column?.options.nullable).toBe(true);
    },
  );
});

describe("database/init.sql employee profile schema", () => {
  const sql = readFileSync(INIT_SQL, "utf8");

  it.each(EXPECTED_COLUMNS)("adds $name idempotently", ({ sql: fragment }) => {
    expect(sql).toContain(
      `ALTER TABLE tbl_empleado ADD COLUMN IF NOT EXISTS ${fragment};`,
    );
  });

  it("creates the partial unique DPI index", () => {
    expect(sql).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_empleado_dpi ON tbl_empleado (dpi_emple) WHERE dpi_emple IS NOT NULL;",
    );
  });
});