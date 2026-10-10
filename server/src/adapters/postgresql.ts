import pg from "pg";
import type { ConnectParams, TableMeta, TableRef } from "../types.js";
import { formatDataType, type DbAdapter } from "./base.js";
import { collectTablesWithWorker } from "./collect.js";

function clientConfig(params: ConnectParams): pg.ClientConfig {
  return {
    host: params.host || "localhost",
    port: params.port || 5432,
    database: params.database,
    user: params.user,
    password: params.password,
    connectionTimeoutMillis: 10000,
  };
}

function client(params: ConnectParams): pg.Client {
  return new pg.Client(clientConfig(params));
}

async function collectOnClient(c: pg.PoolClient | pg.Client, ref: TableRef): Promise<TableMeta> {
  const [commentR, colsR, pkR, fkR, uniqR, idxR] = await Promise.all([
    c.query(
      `
      select obj_description(c.oid) as comment
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname = $2 and c.relkind = 'r'
    `,
      [ref.schema, ref.name],
    ),
    c.query(
      `
      select
        c.ordinal_position,
        c.column_name,
        c.data_type,
        c.udt_name,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.is_nullable,
        c.column_default,
        pgd.description as comment,
        case when c.is_identity = 'YES' then true else false end as identity,
        case when c.column_default like 'nextval%' then true else false end as serial_like
      from information_schema.columns c
      left join pg_catalog.pg_statio_all_tables st
        on st.schemaname = c.table_schema and st.relname = c.table_name
      left join pg_catalog.pg_description pgd
        on pgd.objoid = st.relid and pgd.objsubid = c.ordinal_position
      where c.table_schema = $1 and c.table_name = $2
      order by c.ordinal_position
    `,
      [ref.schema, ref.name],
    ),
    c.query(
      `
      select kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
      where tc.constraint_type = 'PRIMARY KEY'
        and tc.table_schema = $1 and tc.table_name = $2
    `,
      [ref.schema, ref.name],
    ),
    c.query(
      `
      select
        kcu.column_name,
        ccu.table_schema as ref_schema,
        ccu.table_name as ref_table,
        ccu.column_name as ref_column,
        tc.constraint_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
       and ccu.constraint_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = $1 and tc.table_name = $2
    `,
      [ref.schema, ref.name],
    ),
    c.query(
      `
      select tc.constraint_name, tc.constraint_type, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
      where tc.constraint_type in ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')
        and tc.table_schema = $1 and tc.table_name = $2
      order by tc.constraint_type, tc.constraint_name, kcu.ordinal_position
    `,
      [ref.schema, ref.name],
    ),
    c.query(
      `
      select
        i.relname as index_name,
        ix.indisunique as is_unique,
        a.attname as column_name,
        array_position(ix.indkey, a.attnum) as ord
      from pg_class t
      join pg_namespace n on n.oid = t.relnamespace
      join pg_index ix on t.oid = ix.indrelid
      join pg_class i on i.oid = ix.indexrelid
      join pg_attribute a on a.attrelid = t.oid and a.attnum = any(ix.indkey)
      where n.nspname = $1 and t.relname = $2 and not ix.indisprimary
      order by i.relname, ord
    `,
      [ref.schema, ref.name],
    ),
  ]);

  const tableComment = (commentR.rows[0]?.comment as string | null) || null;
  const pkSet = new Set(pkR.rows.map((r) => String(r.column_name)));
  const fkMap = new Map<string, string>();
  for (const r of fkR.rows) {
    fkMap.set(String(r.column_name), `${r.ref_schema}.${r.ref_table}.${r.ref_column}`);
  }

  const columns = colsR.rows.map((r) => {
    const typeName = r.data_type === "USER-DEFINED" ? String(r.udt_name) : String(r.data_type);
    const name = String(r.column_name);
    return {
      ordinal: Number(r.ordinal_position),
      name,
      dataType: formatDataType(
        typeName,
        r.character_maximum_length == null ? null : Number(r.character_maximum_length),
        r.numeric_precision == null ? null : Number(r.numeric_precision),
        r.numeric_scale == null ? null : Number(r.numeric_scale),
      ),
      nullable: r.is_nullable === "YES",
      defaultValue: r.column_default == null ? null : String(r.column_default),
      comment: r.comment == null ? null : String(r.comment),
      isPk: pkSet.has(name),
      isFk: fkMap.has(name),
      fkRef: fkMap.get(name) || null,
      identity: Boolean(r.identity || r.serial_like),
      remark: null,
    };
  });

  const constraintMap = new Map<string, TableMeta["constraints"][number]>();
  for (const r of uniqR.rows) {
    const typeRaw = String(r.constraint_type);
    const type = typeRaw === "PRIMARY KEY" ? "PK" : typeRaw === "FOREIGN KEY" ? "FK" : "UNIQUE";
    const key = String(r.constraint_name);
    const existing = constraintMap.get(key);
    if (existing) existing.columns.push(String(r.column_name));
    else {
      const fk = fkR.rows.find((f) => String(f.constraint_name) === key);
      constraintMap.set(key, {
        name: key,
        type,
        columns: [String(r.column_name)],
        ref: fk ? `${fk.ref_schema}.${fk.ref_table}.${fk.ref_column}` : null,
        remark: null,
      });
    }
  }

  const indexMap = new Map<string, TableMeta["indexes"][number]>();
  for (const r of idxR.rows) {
    const key = String(r.index_name);
    const existing = indexMap.get(key);
    if (existing) existing.columns.push(String(r.column_name));
    else {
      indexMap.set(key, {
        name: key,
        unique: Boolean(r.is_unique),
        columns: [String(r.column_name)],
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

export const postgresqlAdapter: DbAdapter = {
  async testConnection(params) {
    const c = client(params);
    try {
      await c.connect();
      const r = await c.query("select version() as v");
      return { ok: true, serverVersion: String(r.rows[0]?.v || "PostgreSQL") };
    } finally {
      await c.end().catch(() => undefined);
    }
  },

  async listSchemas(params) {
    const c = client(params);
    try {
      await c.connect();
      const r = await c.query(`
        select schema_name
        from information_schema.schemata
        where schema_name not in ('pg_catalog', 'information_schema', 'pg_toast')
        order by schema_name
      `);
      return r.rows.map((x) => String(x.schema_name));
    } finally {
      await c.end().catch(() => undefined);
    }
  },

  async listTables(params, schema) {
    const c = client(params);
    try {
      await c.connect();
      const r = await c.query(
        `
        select table_schema, table_name
        from information_schema.tables
        where table_type = 'BASE TABLE' and table_schema = $1
        order by table_name
      `,
        [schema],
      );
      return r.rows.map((x) => ({ schema: String(x.table_schema), name: String(x.table_name) }));
    } finally {
      await c.end().catch(() => undefined);
    }
  },

  async collectTable(params, ref) {
    const c = client(params);
    try {
      await c.connect();
      return await collectOnClient(c, ref);
    } finally {
      await c.end().catch(() => undefined);
    }
  },

  async collectTables(params, refs) {
    const pool = new pg.Pool({ ...clientConfig(params), max: 6 });
    try {
      return await collectTablesWithWorker(refs, 6, async (ref) => {
        const c = await pool.connect();
        try {
          return await collectOnClient(c, ref);
        } finally {
          c.release();
        }
      });
    } finally {
      await pool.end();
    }
  },
};
