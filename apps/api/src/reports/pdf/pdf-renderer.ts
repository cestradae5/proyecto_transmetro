import PDFDocument from "pdfkit";

import type { ReportDocument, ReportMeta, ReportTable } from "../reports.contracts.js";

const MARGIN = 40;
const CELL_PADDING = 4;
const PRIMARY = "#1e3a8a";
const MUTED = "#64748b";
const BORDER = "#cbd5e1";
const HEADER_FILL = "#e2e8f0";

export interface PdfRendererOptions {
  /** Content-stream compression; tests disable it to inspect the output. */
  compress?: boolean;
}

// Lays out a ReportDocument as an A4 PDF: header, key figures, one table per
// section (header row repeated on every page) and "Página X de Y" footers.
// Standard Helvetica (WinAnsi) covers Spanish accents and ñ.
export class PdfRenderer {
  constructor(private readonly options: PdfRendererOptions = {}) {}

  render(report: ReportDocument, meta: ReportMeta): Promise<Buffer> {
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      bufferPages: true,
      compress: this.options.compress ?? true,
      info: { Title: report.title, Author: "Transmetro", Creator: "Transmetro admin" },
    });

    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    try {
      this.writeHeader(doc, report, meta);
      this.writeSummary(doc, report.summary);
      for (const section of report.sections) this.writeSection(doc, section);
      this.writeFooters(doc, meta);
      doc.end();
    } catch (error) {
      doc.destroy();
      return Promise.reject(error);
    }
    return done;
  }

  private writeHeader(doc: PDFKit.PDFDocument, report: ReportDocument, meta: ReportMeta): void {
    doc.fillColor(PRIMARY).font("Helvetica-Bold").fontSize(10).text("TRANSMETRO");
    doc.moveDown(0.3).fillColor("#0f172a").fontSize(18).text(report.title);
    if (report.subtitle) doc.font("Helvetica").fontSize(11).fillColor(MUTED).text(report.subtitle);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(`Generado el ${formatDateTime(meta.generatedAt)} por ${meta.generatedBy}`);
    doc.moveDown(0.8);
  }

  private writeSummary(doc: PDFKit.PDFDocument, summary: ReportDocument["summary"]): void {
    if (summary.length === 0) return;
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text("Resumen");
    doc.moveDown(0.2).font("Helvetica").fontSize(10);
    for (const [label, value] of summary) {
      doc.fillColor(MUTED).text(`${label}: `, { continued: true }).fillColor("#0f172a").text(value);
    }
    doc.moveDown(0.8);
  }

  private writeSection(doc: PDFKit.PDFDocument, section: ReportTable): void {
    this.ensureSpace(doc, 60);
    doc.x = MARGIN;
    doc.font("Helvetica-Bold").fontSize(12).fillColor(PRIMARY).text(section.heading);
    if (section.note) doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(section.note);
    doc.moveDown(0.3);

    if (section.rows.length === 0) {
      doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED).text(section.emptyMessage ?? "Sin datos.");
      doc.moveDown(0.8);
      return;
    }

    const width = doc.page.width - MARGIN * 2;
    const columnWidth = width / section.columns.length;
    this.writeRow(doc, section.columns, columnWidth, true);
    for (const row of section.rows) {
      const height = this.rowHeight(doc, row, columnWidth, false);
      if (this.ensureSpace(doc, height)) this.writeRow(doc, section.columns, columnWidth, true);
      this.writeRow(doc, row, columnWidth, false);
    }
    doc.x = MARGIN;
    doc.moveDown(0.8);
  }

  private rowHeight(doc: PDFKit.PDFDocument, cells: string[], columnWidth: number, header: boolean): number {
    doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(8);
    const inner = columnWidth - CELL_PADDING * 2;
    return Math.max(...cells.map((cell) => doc.heightOfString(cell, { width: inner }))) + CELL_PADDING * 2;
  }

  private writeRow(doc: PDFKit.PDFDocument, cells: string[], columnWidth: number, header: boolean): void {
    const height = this.rowHeight(doc, cells, columnWidth, header);
    const top = doc.y;
    const width = columnWidth * cells.length;
    if (header) doc.rect(MARGIN, top, width, height).fill(HEADER_FILL);
    doc.lineWidth(0.5).strokeColor(BORDER).rect(MARGIN, top, width, height).stroke();

    doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor("#0f172a");
    cells.forEach((cell, index) => {
      doc.text(cell, MARGIN + index * columnWidth + CELL_PADDING, top + CELL_PADDING, {
        width: columnWidth - CELL_PADDING * 2,
        lineBreak: true,
      });
    });
    doc.x = MARGIN;
    doc.y = top + height;
  }

  /** Starts a new page when `height` does not fit; returns whether it did. */
  private ensureSpace(doc: PDFKit.PDFDocument, height: number): boolean {
    if (doc.y + height <= doc.page.height - MARGIN - 20) return false;
    doc.addPage();
    return true;
  }

  private writeFooters(doc: PDFKit.PDFDocument, meta: ReportMeta): void {
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      // Writing inside the bottom margin must not trigger an automatic page break.
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `Transmetro - ${formatDateTime(meta.generatedAt)} - Página ${index + 1} de ${range.count}`,
          MARGIN,
          doc.page.height - MARGIN + 10,
          { width: doc.page.width - MARGIN * 2, align: "center", lineBreak: false },
        );
      doc.page.margins.bottom = bottom;
    }
  }
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("es-GT", {
    timeZone: "America/Guatemala",
    dateStyle: "short",
    timeStyle: "short",
  });
}
