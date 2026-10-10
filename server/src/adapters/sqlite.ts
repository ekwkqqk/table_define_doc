import { DatabaseSync } from "node:sqlite";
import type { ConnectParams, TableMeta, TableRef } from "../types.js";
import type { DbAdapter } from "./base.js";
import type { CollectResult } from "./collect.js";

function open(params: ConnectParams): DatabaseSync {
  if (!params.filePath) {
    throw new Error("SQLite 파일 경로가 필요합니다.");
  }
  return new DatabaseSync(params.filePath, { readOnly: true });
}

function collectOnDb(db: DatabaseSync, ref: TableRef): TableMeta {
  const cols = db.prepare(`pragma table_info(${quoteIdent(ref.name)})`).all() as {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }[];

  const fkRows = db.prepare(`pragma foreign_key_list(${quoteIdent(ref.name)})`).all() as {
    id: number;
    table: string;
    from: string;
    to: string;
  }[];
  const fkMap = new Map<string, string>();
  for (const f of fkRows) {
    fkMap.set(f.from, `main.${f.table}.${f.to}`);
  }

  const idxList = db.prepare(`pragma index_list(${quoteIdent(ref.name)})`).all() as {
    name: string;
    unique: number;
    origin: string;
  }[];

  const indexes: TableMeta["indexes"] = [];
  const constraints: TableMeta["constraints"] = [];

  const pkCols = cols
    .filter((c) => c.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((c) => c.name);
  if (pkCols.length) {
    constraints.push({
      name: "PRIMARY",
      type: "PK",
      columns: pkCols,
      ref: null,
      remark: null,
    });
  }

  const fkGroups = new Map<number, { table: string; cols: string[]; refs: string[] }>();
  for (const f of fkRows) {
    const g = fkGroups.get(f.id) || { table: f.table, cols: [], refs: [] };
    g.cols.push(f.from);
    g.refs.push(f.to);
    fkGroups.set(f.id, g);
  }
  for (const [id, g] of fkGroups) {
    constraints.push({
      name: `FK_${id}`,
      type: "FK",
      columns: g.cols,
      ref: `main.${g.table}.${g.refs.join(",")}`,
      remark: null,
    });
  }

  for (const idx of idxList) {
    if (idx.origin === "pk") continue;
    const info = db.prepare(`pragma index_info(${quoteIdent(idx.name)})`).all() as {
      name: string;
    }[];
    const columns = info.map((i) => i.name);
    if (idx.origin === "u") {
      constraints.push({
        name: idx.name,
        type: "UNIQUE",
        columns,
        ref: null,
        remark: null,
      });
    }
    indexes.push({
      name: idx.name,
      unique: Number(idx.unique) === 1,
      columns,
      remark: null,
    });
  }

  return {
    schema: ref.schema || "main",
    name: ref.name,
    comment: null,
    columns: cols.map((c) => ({
      ordinal: c.cid + 1,
      name: c.name,
      dataType: c.type || "ANY",
      nullable: c.notnull === 0,
      defaultValue: c.dflt_value,
      comment: null,
      isPk: c.pk > 0,
      isFk: fkMap.has(c.name),
      fkRef: fkMap.get(c.name) || null,
      identity: false,
      remark: null,
    })),
    constraints,
    indexes,
  };
}

export const sqliteAdapter: DbAdapter = {
  async testConnection(params) {
    const db = open(params);
    try {
      const row = db.prepare("select sqlite_version() as v").get() as { v: string };
      return { ok: true, serverVersion: `SQLite ${row.v}` };
    } finally {
      db.close();
    }
  },

  async listSchemas() {
    return ["main"];
  },

  async listTables(params) {
    const db = open(params);
    try {
      const rows = db
        .prepare(
          `select name from sqlite_master
           where type = 'table' and name not like 'sqlite_%'
           order by name`,
        )
        .all() as { name: string }[];
      return rows.map((r) => ({ schema: "main", name: r.name }));
    } finally {
      db.close();
    }
  },

  async collectTable(params, ref: TableRef) {
    const db = open(params);
    try {
      return collectOnDb(db, ref);
    } finally {
      db.close();
    }
  },

  async collectTables(params, refs): Promise<CollectResult> {
    const db = open(params);
    const tables: TableMeta[] = [];
    const failures: CollectResult["failures"] = [];
    try {
      for (const ref of refs) {
        try {
          tables.push(collectOnDb(db, ref));
        } catch (e) {
          failures.push({
            schema: ref.schema,
            name: ref.name,
            error: e instanceof Error ? e.message : "수집 실패",
          });
        }
      }
    } finally {
      db.close();
    }
    return { tables, failures };
  },
};

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
