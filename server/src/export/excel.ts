import ExcelJS from "exceljs";
import type { DocumentSettings, Snapshot, TableMeta } from "../types.js";

const COLORS = {
  titleBg: "0F6E56",
  titleFg: "FFFFFF",
  sectionBg: "1F8A70",
  sectionFg: "FFFFFF",
  headerBg: "D8EDE6",
  headerFg: "1C2430",
  labelBg: "F3F7F5",
  border: "A8B8B0",
  link: "0B5FFF",
};

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: `FF${COLORS.border}` } },
  left: { style: "thin", color: { argb: `FF${COLORS.border}` } },
  bottom: { style: "thin", color: { argb: `FF${COLORS.border}` } },
  right: { style: "thin", color: { argb: `FF${COLORS.border}` } },
};

function yn(v: boolean): string {
  return v ? "Y" : "N";
}

function sheetName(schema: string, name: string, used: Set<string>): string {
  let base = `${schema}_${name}`.replace(/[\\/*?:\[\]]/g, "_");
  if (base.length > 31) base = base.slice(0, 31);
  let candidate = base || "table";
  let i = 1;
  while (used.has(candidate.toLowerCase())) {
    const suffix = `_${i++}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function sheetRef(name: string, cell = "A1"): string {
  const escaped = name.replace(/'/g, "''");
  return `#'${escaped}'!${cell}`;
}

function styleFill(cell: ExcelJS.Cell, argb: string, fg = COLORS.headerFg): void {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${argb}` },
  };
  cell.font = {
    ...(cell.font || {}),
    color: { argb: `FF${fg}` },
    bold: true,
  };
}

function applyRangeBorder(
  ws: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
): void {
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = ws.getCell(r, c);
      cell.border = thinBorder;
      if (cell.alignment == null) {
        cell.alignment = { vertical: "middle", wrapText: true };
      }
    }
  }
}

function styleHeaderRow(ws: ExcelJS.Worksheet, rowNumber: number, colCount: number): void {
  const row = ws.getRow(rowNumber);
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    styleFill(cell, COLORS.headerBg, COLORS.headerFg);
    cell.border = thinBorder;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }
  row.height = 20;
}

function styleSectionTitle(ws: ExcelJS.Worksheet, rowNumber: number, colSpan: number): void {
  const cell = ws.getCell(rowNumber, 1);
  styleFill(cell, COLORS.sectionBg, COLORS.sectionFg);
  cell.font = { bold: true, color: { argb: `FF${COLORS.sectionFg}` }, size: 12 };
  cell.border = thinBorder;
  if (colSpan > 1) {
    ws.mergeCells(rowNumber, 1, rowNumber, colSpan);
  }
}

function writeKeyValueBlock(
  ws: ExcelJS.Worksheet,
  startRow: number,
  rows: [string, string][],
): number {
  rows.forEach(([label, value], idx) => {
    const r = startRow + idx;
    const labelCell = ws.getCell(r, 1);
    const valueCell = ws.getCell(r, 2);
    labelCell.value = label;
    valueCell.value = value;
    styleFill(labelCell, COLORS.labelBg, COLORS.headerFg);
    labelCell.font = { bold: true };
    labelCell.border = thinBorder;
    valueCell.border = thinBorder;
    valueCell.alignment = { vertical: "middle", wrapText: true };
  });
  return startRow + rows.length - 1;
}

function writeTableSheet(ws: ExcelJS.Worksheet, t: TableMeta, tocSheetName: string): void {
  const maxCol = 10;

  // back link + title
  const back = ws.getCell(1, 1);
  back.value = {
    text: "← 목차로",
    hyperlink: sheetRef(tocSheetName, "A1"),
    tooltip: "목차로 이동",
  };
  back.font = { color: { argb: `FF${COLORS.link}` }, underline: true };

  const title = ws.getCell(2, 1);
  title.value = `${t.schema}.${t.name}`;
  styleFill(title, COLORS.titleBg, COLORS.titleFg);
  title.font = { bold: true, size: 14, color: { argb: `FF${COLORS.titleFg}` } };
  ws.mergeCells(2, 1, 2, maxCol);
  applyRangeBorder(ws, 2, 2, 1, maxCol);

  let row = 4;
  styleSectionTitle(ws, row, 2);
  ws.getCell(row, 1).value = "테이블 개요";
  row += 1;
  row =
    writeKeyValueBlock(ws, row, [
      ["스키마", t.schema],
      ["테이블명", t.name],
      ["테이블 설명", t.comment || ""],
    ]) + 2;

  styleSectionTitle(ws, row, maxCol);
  ws.getCell(row, 1).value = "컬럼 정의";
  row += 1;
  const colHeaderRow = row;
  ws.getRow(row).values = [
    "No",
    "컬럼명",
    "데이터 타입",
    "NULL",
    "PK",
    "FK",
    "기본값",
    "Identity",
    "설명",
    "비고",
  ];
  styleHeaderRow(ws, row, maxCol);
  row += 1;
  const colStart = row;
  for (const c of t.columns) {
    ws.getRow(row).values = [
      c.ordinal,
      c.name,
      c.dataType,
      yn(c.nullable),
      c.isPk ? "Y" : "",
      c.isFk ? "Y" : "",
      c.defaultValue ?? "",
      c.identity ? "Y" : "",
      c.comment ?? "",
      c.fkRef || c.remark || "",
    ];
    row += 1;
  }
  const colEnd = Math.max(colStart, row - 1);
  if (t.columns.length) applyRangeBorder(ws, colHeaderRow, colEnd, 1, maxCol);
  else applyRangeBorder(ws, colHeaderRow, colHeaderRow, 1, maxCol);
  row += 1;

  styleSectionTitle(ws, row, 5);
  ws.getCell(row, 1).value = "제약조건";
  row += 1;
  const cstHeaderRow = row;
  ws.getRow(row).values = ["제약명", "종류", "컬럼", "참조", "비고"];
  styleHeaderRow(ws, row, 5);
  row += 1;
  for (const c of t.constraints) {
    ws.getRow(row).values = [c.name, c.type, c.columns.join(", "), c.ref ?? "", c.remark ?? ""];
    row += 1;
  }
  if (!t.constraints.length) {
    ws.getRow(row).values = ["-", "-", "-", "-", "-"];
    row += 1;
  }
  applyRangeBorder(ws, cstHeaderRow, row - 1, 1, 5);
  row += 1;

  styleSectionTitle(ws, row, 4);
  ws.getCell(row, 1).value = "인덱스";
  row += 1;
  const idxHeaderRow = row;
  ws.getRow(row).values = ["인덱스명", "유니크", "컬럼", "비고"];
  styleHeaderRow(ws, row, 4);
  row += 1;
  for (const i of t.indexes) {
    ws.getRow(row).values = [i.name, yn(i.unique), i.columns.join(", "), i.remark ?? ""];
    row += 1;
  }
  if (!t.indexes.length) {
    ws.getRow(row).values = ["-", "-", "-", "-"];
    row += 1;
  }
  applyRangeBorder(ws, idxHeaderRow, row - 1, 1, 4);

  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 10;
  ws.getColumn(5).width = 8;
  ws.getColumn(6).width = 8;
  ws.getColumn(7).width = 18;
  ws.getColumn(8).width = 10;
  ws.getColumn(9).width = 28;
  ws.getColumn(10).width = 28;
}

export async function buildExcel(
  snapshot: Snapshot,
  doc: DocumentSettings,
  meta: { connectionName: string; dbms: string; database?: string },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = doc.author || "table-define-doc";

  const cover = wb.addWorksheet("표지");
  const titleCell = cover.getCell(1, 1);
  titleCell.value = "테이블 정의서";
  styleFill(titleCell, COLORS.titleBg, COLORS.titleFg);
  titleCell.font = { bold: true, size: 16, color: { argb: `FF${COLORS.titleFg}` } };
  cover.mergeCells(1, 1, 1, 2);
  applyRangeBorder(cover, 1, 1, 1, 2);

  const coverRows: [string, string][] = [
    ["시스템명", doc.systemName],
    ["문서 버전", doc.documentVersion],
    ["작성자", doc.author],
    ["작성일", doc.writtenAt],
    ["회사/팀", doc.company],
    ["대상 DB", `${meta.dbms} / ${meta.connectionName} / ${meta.database || ""}`],
    ["수집 시각", snapshot.collectedAt],
  ];
  writeKeyValueBlock(cover, 3, coverRows);
  cover.getColumn(1).width = 16;
  cover.getColumn(2).width = 56;

  const tocLink = cover.getCell(coverRows.length + 4, 1);
  tocLink.value = {
    text: "목차로 이동 →",
    hyperlink: sheetRef("목차", "A1"),
    tooltip: "목차",
  };
  tocLink.font = { color: { argb: `FF${COLORS.link}` }, underline: true };

  const toc = wb.addWorksheet("목차");
  const tocTitle = toc.getCell(1, 1);
  tocTitle.value = "목차";
  styleFill(tocTitle, COLORS.titleBg, COLORS.titleFg);
  tocTitle.font = { bold: true, size: 14, color: { argb: `FF${COLORS.titleFg}` } };
  toc.mergeCells(1, 1, 1, 4);
  applyRangeBorder(toc, 1, 1, 1, 4);

  toc.getRow(3).values = ["No", "스키마", "테이블명", "설명"];
  styleHeaderRow(toc, 3, 4);

  const used = new Set<string>(["표지", "목차"].map((s) => s.toLowerCase()));
  const tableSheets: { table: TableMeta; name: string }[] = snapshot.tables.map((t) => ({
    table: t,
    name: sheetName(t.schema, t.name, used),
  }));

  tableSheets.forEach(({ table: t, name }, idx) => {
    const rowNumber = 4 + idx;
    const row = toc.getRow(rowNumber);
    row.getCell(1).value = idx + 1;
    row.getCell(2).value = t.schema;
    row.getCell(3).value = {
      text: t.name,
      hyperlink: sheetRef(name, "A1"),
      tooltip: `${t.schema}.${t.name} 시트로 이동`,
    };
    row.getCell(3).font = { color: { argb: `FF${COLORS.link}` }, underline: true };
    row.getCell(4).value = t.comment || "";
  });

  if (tableSheets.length) {
    applyRangeBorder(toc, 3, 3 + tableSheets.length, 1, 4);
  } else {
    applyRangeBorder(toc, 3, 3, 1, 4);
  }

  toc.getColumn(1).width = 6;
  toc.getColumn(2).width = 18;
  toc.getColumn(3).width = 28;
  toc.getColumn(4).width = 40;

  for (const { table, name } of tableSheets) {
    const ws = wb.addWorksheet(name);
    writeTableSheet(ws, table, "목차");
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
