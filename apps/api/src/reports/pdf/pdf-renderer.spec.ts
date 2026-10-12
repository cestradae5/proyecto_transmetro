import { PdfRenderer } from "./pdf-renderer.js";
import type { ReportDocument } from "../reports.contracts.js";

const META = { generatedBy: "Ana Admin", generatedAt: new Date("2026-01-15T10:00:00Z") };

function doc(rows: number): ReportDocument {
  return {
    title: "Reporte de flota",
    subtitle: "Prueba",
    summary: [["Total", String(rows)]],
    sections: [
      {
        heading: "Disponible",
        note: "Nota",
        columns: ["Placa", "Marca / modelo", "Año"],
        rows: Array.from({ length: rows }, (_, i) => [`P-${i}`, "Volvo B12 con un nombre de modelo bastante largo para envolver", "2020"]),
        emptyMessage: "Sin datos.",
      },
      { heading: "Vacía", columns: ["A"], rows: [], emptyMessage: "Sin datos." },
    ],
  };
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
}

describe("PdfRenderer", () => {
  const renderer = new PdfRenderer({ compress: false });

  it("renders a complete PDF document", async () => {
    const pdf = await renderer.render(doc(3), META);

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pageCount(pdf)).toBe(1);
  });

  it("flows long tables onto additional pages", async () => {
    const pdf = await renderer.render(doc(150), META);
    expect(pageCount(pdf)).toBeGreaterThan(1);
  });

  it("stores the title as document metadata", async () => {
    const pdf = await renderer.render(doc(1), META);
    expect(pdf.toString("latin1")).toContain("Reporte de flota");
  });
});
