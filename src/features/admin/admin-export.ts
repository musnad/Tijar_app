import { downloadBlob, downloadText } from "@/utils/download-blob";

export type ExpenseLedgerExportRow = {
  created_at: string;
  title: string;
  from_profit: boolean;
  amount_ngn: number;
  notes?: string | null;
};

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function downloadAdminCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const lines = [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  downloadText(`\uFEFF${lines.join("\n")}`, filename, "text/csv;charset=utf-8");
}

function expenseExportRows(rows: ExpenseLedgerExportRow[]) {
  return rows.map((row) => ({
    when: row.created_at,
    title: row.title,
    source: row.from_profit ? "From profit" : "Not from profit",
    amount: Number(row.amount_ngn).toFixed(2),
    notes: row.notes?.trim() || "",
  }));
}

function xmlCell(value: string, type: "String" | "Number" = "String"): string {
  const safe = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<Cell><Data ss:Type="${type}">${safe}</Data></Cell>`;
}

export function downloadExpenseLedgerExcel(rows: ExpenseLedgerExportRow[], filename: string): void {
  const body = expenseExportRows(rows);
  const fromProfit = rows.filter((r) => r.from_profit).reduce((n, r) => n + Number(r.amount_ngn), 0);
  const outside = rows.filter((r) => !r.from_profit).reduce((n, r) => n + Number(r.amount_ngn), 0);
  const total = fromProfit + outside;
  const tableRows = [
    ["When", "Expense", "Source", "Amount (NGN)", "Notes"].map((h) => xmlCell(h)).join(""),
    ...body.map((row) =>
      [xmlCell(row.when), xmlCell(row.title), xmlCell(row.source), xmlCell(row.amount, "Number"), xmlCell(row.notes)].join(""),
    ),
    ["", "", "From profit total", fromProfit.toFixed(2), ""].map((v, i) => xmlCell(v, i === 3 ? "Number" : "String")).join(""),
    ["", "", "Outside profit total", outside.toFixed(2), ""].map((v, i) => xmlCell(v, i === 3 ? "Number" : "String")).join(""),
    ["", "", "All expenses", total.toFixed(2), ""].map((v, i) => xmlCell(v, i === 3 ? "Number" : "String")).join(""),
  ];
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Expense ledger"><Table>${tableRows.map((row) => `<Row>${row}</Row>`).join("")}</Table></Worksheet>
</Workbook>`;
  downloadBlob(new Blob(["\uFEFF", xml], { type: "application/vnd.ms-excel" }), filename);
}

export async function downloadExpenseLedgerPdf(rows: ExpenseLedgerExportRow[], filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const body = expenseExportRows(rows);
  const fromProfit = rows.filter((r) => r.from_profit).reduce((n, r) => n + Number(r.amount_ngn), 0);
  const outside = rows.filter((r) => !r.from_profit).reduce((n, r) => n + Number(r.amount_ngn), 0);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text("TIJAR expense ledger", 40, 36);
  doc.setFontSize(10);
  doc.text(`Exported ${new Date().toLocaleString("en-NG")} · ${rows.length} expenses`, 40, 54);
  doc.text(
    `From profit ₦${fromProfit.toLocaleString("en-NG")} · Not from profit ₦${outside.toLocaleString("en-NG")} · Total ₦${(fromProfit + outside).toLocaleString("en-NG")}`,
    40,
    70,
  );
  autoTable(doc, {
    startY: 84,
    head: [["When", "Expense", "Source", "Amount (NGN)", "Notes"]],
    body: body.map((row) => [row.when, row.title, row.source, row.amount, row.notes]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [31, 122, 77] },
    columnStyles: { 3: { halign: "right" } },
  });
  doc.save(filename);
}
