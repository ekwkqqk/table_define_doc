import type { ConnectParams, TableMeta, TableRef } from "../types.js";
import type { CollectResult } from "./collect.js";

export interface DbAdapter {
  testConnection(params: ConnectParams): Promise<{ ok: true; serverVersion: string }>;
  listSchemas(params: ConnectParams): Promise<string[]>;
  listTables(params: ConnectParams, schema: string): Promise<TableRef[]>;
  collectTable(params: ConnectParams, ref: TableRef): Promise<TableMeta>;
  collectTables(params: ConnectParams, refs: TableRef[]): Promise<CollectResult>;
}

export function yn(v: boolean): "Y" | "N" {
  return v ? "Y" : "N";
}

export function formatDataType(
  typeName: string,
  length?: number | null,
  precision?: number | null,
  scale?: number | null,
): string {
  const t = (typeName || "").toLowerCase();
  if (precision != null && scale != null && ["numeric", "decimal", "number"].some((x) => t.includes(x))) {
    return `${typeName}(${precision},${scale})`;
  }
  if (length != null && length > 0 && !["text", "json", "jsonb", "blob", "clob"].includes(t)) {
    if (["character varying", "varchar", "nvarchar", "char", "nchar", "character"].some((x) => t.includes(x))) {
      return `${typeName}(${length})`;
    }
  }
  return typeName;
}

export function tableKey(schema: string, name: string): string {
  return `${schema}\u0000${name}`;
}
