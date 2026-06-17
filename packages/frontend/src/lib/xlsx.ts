/**
 * xlsx.ts — export Excel nativo (.xlsx) via exceljs. Helper unico per le pagine
 * con export (Pivot preventivo-consuntivo, Ordini di lavoro, …).
 */
import ExcelJS from 'exceljs';

export interface XlsxColumn { header: string; key: string; width?: number }
export interface XlsxSheet { name: string; columns: XlsxColumn[]; rows: Record<string, unknown>[] }

/** Genera e scarica un file .xlsx con uno o più fogli. */
export async function downloadXlsx(filename: string, sheets: XlsxSheet[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'siSuite';
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    ws.columns = s.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
    s.rows.forEach((r) => ws.addRow(r));
    const head = ws.getRow(1);
    head.font = { bold: true };
    head.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F0FB' } }; });
  }
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}
