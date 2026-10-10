import type { DocumentSettings, Snapshot, TableMeta } from "../types.js";

function yn(v: boolean): string {
  return v ? "Y" : "N";
}

function tableSection(t: TableMeta): string {
  const lines: string[] = [];
  lines.push(`## ${t.schema}.${t.name}`);
  lines.push("");
  lines.push("### 테이블 개요");
  lines.push("");
  lines.push("| 항목 | 내용 |");
  lines.push("|------|------|");
  lines.push(`| 스키마 | ${t.schema} |`);
  lines.push(`| 테이블명 | ${t.name} |`);
  lines.push(`| 테이블 설명 | ${t.comment || ""} |`);
  lines.push("");
  lines.push("### 컬럼 정의");
  lines.push("");
  lines.push("| No | 컬럼명 | 데이터 타입 | NULL | PK | FK | 기본값 | Identity | 설명 | 비고 |");
  lines.push("|----|--------|-------------|------|----|----|--------|----------|------|------|");
  for (const c of t.columns) {
    lines.push(
      `| ${c.ordinal} | ${c.name} | ${c.dataType} | ${yn(c.nullable)} | ${c.isPk ? "Y" : ""} | ${c.isFk ? "Y" : ""} | ${c.defaultValue ?? ""} | ${c.identity ? "Y" : ""} | ${c.comment ?? ""} | ${c.fkRef || c.remark || ""} |`,
    );
  }
  lines.push("");
  lines.push("### 제약조건");
  lines.push("");
  lines.push("| 제약명 | 종류 | 컬럼 | 참조 | 비고 |");
  lines.push("|--------|------|------|------|------|");
  for (const c of t.constraints) {
    lines.push(
      `| ${c.name} | ${c.type} | ${c.columns.join(", ")} | ${c.ref ?? ""} | ${c.remark ?? ""} |`,
    );
  }
  if (!t.constraints.length) lines.push("| | | | | |");
  lines.push("");
  lines.push("### 인덱스");
  lines.push("");
  lines.push("| 인덱스명 | 유니크 | 컬럼 | 비고 |");
  lines.push("|----------|--------|------|------|");
  for (const i of t.indexes) {
    lines.push(`| ${i.name} | ${yn(i.unique)} | ${i.columns.join(", ")} | ${i.remark ?? ""} |`);
  }
  if (!t.indexes.length) lines.push("| | | | |");
  lines.push("");
  return lines.join("\n");
}

export function buildMarkdown(
  snapshot: Snapshot,
  doc: DocumentSettings,
  meta: { connectionName: string; dbms: string; database?: string },
): string {
  const lines: string[] = [];
  lines.push("# 테이블 정의서");
  lines.push("");
  lines.push("## 문서 정보");
  lines.push("");
  lines.push("| 항목 | 내용 |");
  lines.push("|------|------|");
  lines.push(`| 시스템명 | ${doc.systemName} |`);
  lines.push(`| 문서 버전 | ${doc.documentVersion} |`);
  lines.push(`| 작성자 | ${doc.author} |`);
  lines.push(`| 작성일 | ${doc.writtenAt} |`);
  lines.push(`| 회사/팀 | ${doc.company} |`);
  lines.push(`| 대상 DB | ${meta.dbms} / ${meta.connectionName} / ${meta.database || ""} |`);
  lines.push(`| 수집 시각 | ${snapshot.collectedAt} |`);
  lines.push("");
  lines.push("## 목차");
  lines.push("");
  for (const t of snapshot.tables) {
    lines.push(`- ${t.schema}.${t.name}`);
  }
  lines.push("");
  for (const t of snapshot.tables) {
    lines.push(tableSection(t));
  }
  return lines.join("\n");
}
