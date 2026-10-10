import mysql, { type Connection, type PoolConnection } from "mysql2/promise";
import type { ConnectParams, TableMeta, TableRef } from "../types.js";
import type { DbAdapter } from "./base.js";
import { collectTablesWithWorker } from "./collect.js";

function connConfig(params: ConnectParams) {
  return {
    host: params.host || "localhost",
    port: params.port || 3306,
    database: params.database,
    user: params.user,
    password: params.password,
    connectTimeout: 10000,
  };
}

async function conn(params: ConnectParams) {
  return mysql.createConnection(connConfig(params));
}

async function collectOnConnection(c: Connection | PoolConnection, ref: TableRef): Promise<TableMeta> {
  const [[tRows], [cols], [pkRows], [fkRows], [cstRows], [idxRows]] = await Promise.all([
    c.query(
      `select table_comment from information_schema.tables
       where table_schema = ? and table_name = ? and table_type = 'BASE TABLE'`,
      [ref.schema, ref.name],
    ),
    c.query(
      `select
         ordinal_position, column_name, column_type, is_nullable, column_default,
         column_comment, extra
       from information_schema.columns
       where table_schema = ? and table_name = ?
       order by ordinal_position`,
      [ref.schema, ref.name],
    ),
    c.query(
      `select column_name from information_schema.key_column_usage
       where table_schema = ? and table_name = ? and constraint_name = 'PRIMARY'`,
      [ref.schema, ref.name],
    ),
    c.query(
      `select
         column_name, referenced_table_schema, referenced_table_name, referenced_column_name, constraint_name
       from information_schema.key_column_usage
       where table_schema = ? and table_name = ?
         and referenced_table_name is not null`,
      [ref.schema, ref.name],
    ),
    c.query(
      `select tc.constraint_name, tc.constraint_type, kcu.column_name,
              kcu.referenced_table_schema, kcu.referenced_table_name, kcu.referenced_column_name
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on tc.constraint_schema = kcu.constraint_schema
        and tc.constraint_name = kcu.constraint_name
        and tc.table_name = kcu.table_name
       where tc.table_schema = ? and tc.table_name = ?
         and tc.constraint_type in ('PRIMARY KEY','FOREIGN KEY','UNIQUE')
       order by tc.constraint_type, tc.constraint_name, kcu.ordinal_position`,
      [ref.schema, ref.name],
    ),
    c.query(
      `select index_name, non_unique, column_name, seq_in_index
       from information_schema.statistics
       where table_schema = ? and table_name = ? and index_name <> 'PRIMARY'
       order by index_name, seq_in_index`,
      [ref.schema, ref.name],
    ),
  ]);

  const tableComment =
    ((tRows as { table_comment: string }[])[0]?.table_comment || "").trim() || null;
  const pkSet = new Set((pkRows as { column_name: string }[]).map((r) => r.column_name));
  const fkMap = new Map<string, string>();
  for (const r of fkRows as {
    column_name: string;
    referenced_table_schema: string;
    referenced_table_name: string;
    referenced_column_name: string;
  }[]) {
    fkMap.set(
      r.column_name,
      `${r.referenced_table_schema}.${r.referenced_table_name}.${r.referenced_column_name}`,
    );
  }

  const columns = (
    cols as {
      ordinal_position: number;
      column_name: string;
      column_type: string;
      is_nullable: string;
      column_default: string | null;
      column_comment: string;
      extra: string;
    }[]
  ).map((r) => ({
    ordinal: Number(r.ordinal_position),
    name: r.column_name,
    dataType: r.column_type,
    nullable: r.is_nullable === "YES",
    defaultValue: r.column_default,
    comment: (r.column_comment || "").trim() || null,
    isPk: pkSet.has(r.column_name),
    isFk: fkMap.has(r.column_name),
    fkRef: fkMap.get(r.column_name) || null,
    identity: String(r.extra || "").toLowerCase().includes("auto_increment"),
    remark: null,
  }));

  const constraintMap = new Map<string, TableMeta["constraints"][number]>();
  for (const r of cstRows as {
    constraint_name: string;
    constraint_type: string;
    column_name: string;
    referenced_table_schema: string | null;
    referenced_table_name: string | null;
    referenced_column_name: string | null;
  }[]) {
    const type =
      r.constraint_type === "PRIMARY KEY" ? "PK" : r.constraint_type === "FOREIGN KEY" ? "FK" : "UNIQUE";
    const existing = constraintMap.get(r.constraint_name);
    if (existing) existing.columns.push(r.column_name);
    else {
      constraintMap.set(r.constraint_name, {
        name: r.constraint_name,
        type,
        columns: [r.column_name],
        ref: r.referenced_table_name
          ? `${r.referenced_table_schema}.${r.referenced_table_name}.${r.referenced_column_name}`
          : null,
        remark: null,
      });
    }
  }

  const indexMap = new Map<string, TableMeta["indexes"][number]>();
  for (const r of idxRows as { index_name: string; non_unique: number; column_name: string }[]) {
    const existing = indexMap.get(r.index_name);
    if (existing) existing.columns.push(r.column_name);
    else {
      indexMap.set(r.index_name, {
        name: r.index_name,
        unique: Number(r.non_unique) === 0,
        columns: [r.column_name],
        remark: null,
      });
    }
  }

  return {
    schema: ref.schema,
    name: ref.name,
    comment: tableComment,
    columns,
    constraints: [...constraintMap.values()],
    indexes: [...indexMap.values()],
  };
}

export const mysqlAdapter: DbAdapter = {
  async testConnection(params) {
    const c = await conn(params);
    try {
      const [rows] = await c.query("select version() as v");
      const v = (rows as { v: string }[])[0]?.v || "MySQL";
      return { ok: true, serverVersion: String(v) };
    } finally {
      await c.end();
    }
  },

  async listSchemas(params) {
    const c = await conn(params);
    try {
      const [rows] = await c.query(
        `select schema_name as name from information_schema.schemata
         where schema_name not in ('information_schema','mysql','performance_schema','sys')
         order by schema_name`,
      );
      return (rows as { name: string }[]).map((r) => r.name);
    } finally {
      await c.end();
    }
  },

  async listTables(params, schema) {
    const c = await conn(params);
    try {
      const [rows] = await c.query(
        `select table_schema as s, table_name as n
         from information_schema.tables
         where table_type = 'BASE TABLE' and table_schema = ?
         order by table_name`,
        [schema],
      );
      return (rows as { s: string; n: string }[]).map((r) => ({ schema: r.s, name: r.n }));
    } finally {
      await c.end();
    }
  },

  async collectTable(params, ref) {
    const c = await conn(params);
    try {
      return await collectOnConnection(c, ref);
    } finally {
      await c.end();
    }
  },

  async collectTables(params, refs) {
    const pool = mysql.createPool({ ...connConfig(params), connectionLimit: 6 });
    try {
      return await collectTablesWithWorker(refs, 6, async (ref) => {
        const c = await pool.getConnection();
        try {
          return await collectOnConnection(c, ref);
        } finally {
          c.release();
        }
      });
    } finally {
      await pool.end();
    }
  },
};
