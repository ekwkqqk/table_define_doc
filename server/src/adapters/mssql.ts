import sql from "mssql";
import type { ConnectParams, TableMeta, TableRef } from "../types.js";
import { formatDataType, type DbAdapter } from "./base.js";
import { collectTablesWithWorker } from "./collect.js";

function config(params: ConnectParams): sql.config {
  return {
    server: params.host || "localhost",
    port: params.port || 1433,
    database: params.database,
    user: params.user,
    password: params.password,
    options: {
      encrypt: params.options?.encrypt === "true",
      trustServerCertificate: params.options?.trustServerCertificate !== "false",
    },
    connectionTimeout: 10000,
    requestTimeout: 30000,
    pool: { max: 6, min: 0, idleTimeoutMillis: 10000 },
  };
}

async function withPool<T>(params: ConnectParams, fn: (pool: sql.ConnectionPool) => Promise<T>): Promise<T> {
  const pool = new sql.ConnectionPool(config(params));
  await pool.connect();
  try {
    return await fn(pool);
  } finally {
    await pool.close();
  }
}

async function collectOnPool(pool: sql.ConnectionPool, ref: TableRef): Promise<TableMeta> {
  const [commentR, colsR, pkR, fkR, cstR, idxR] = await Promise.all([
    pool
      .request()
      .input("schema", sql.NVarChar, ref.schema)
      .input("table", sql.NVarChar, ref.name)
      .query(`
        select cast(ep.value as nvarchar(max)) as comment
        from sys.tables t
        join sys.schemas s on s.schema_id = t.schema_id
        left join sys.extended_properties ep
          on ep.major_id = t.object_id and ep.minor_id = 0 and ep.name = 'MS_Description'
        where s.name = @schema and t.name = @table
      `),
    pool
      .request()
      .input("schema", sql.NVarChar, ref.schema)
      .input("table", sql.NVarChar, ref.name)
      .query(`
        select
          c.ORDINAL_POSITION as ordinal_position,
          c.COLUMN_NAME as column_name,
          c.DATA_TYPE as data_type,
          c.CHARACTER_MAXIMUM_LENGTH as character_maximum_length,
          c.NUMERIC_PRECISION as numeric_precision,
          c.NUMERIC_SCALE as numeric_scale,
          c.IS_NULLABLE as is_nullable,
          c.COLUMN_DEFAULT as column_default,
          cast(ep.value as nvarchar(max)) as comment,
          case when ic.is_identity = 1 then 1 else 0 end as is_identity
        from INFORMATION_SCHEMA.COLUMNS c
        join sys.schemas s on s.name = c.TABLE_SCHEMA
        join sys.tables t on t.schema_id = s.schema_id and t.name = c.TABLE_NAME
        join sys.columns sc on sc.object_id = t.object_id and sc.name = c.COLUMN_NAME
        left join sys.identity_columns ic on ic.object_id = sc.object_id and ic.column_id = sc.column_id
        left join sys.extended_properties ep
          on ep.major_id = t.object_id and ep.minor_id = sc.column_id and ep.name = 'MS_Description'
        where c.TABLE_SCHEMA = @schema and c.TABLE_NAME = @table
        order by c.ORDINAL_POSITION
      `),
    pool
      .request()
      .input("schema", sql.NVarChar, ref.schema)
      .input("table", sql.NVarChar, ref.name)
      .query(`
        select kcu.COLUMN_NAME as column_name
        from INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        join INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
          on tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
         and tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
        where tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
          and tc.TABLE_SCHEMA = @schema and tc.TABLE_NAME = @table
      `),
    pool
      .request()
      .input("schema", sql.NVarChar, ref.schema)
      .input("table", sql.NVarChar, ref.name)
      .query(`
        select
          c.name as constraint_name,
          col.name as column_name,
          rs.name as ref_schema,
          rt.name as ref_table,
          rcol.name as ref_column
        from sys.foreign_keys c
        join sys.foreign_key_columns fkc on fkc.constraint_object_id = c.object_id
        join sys.tables t on t.object_id = c.parent_object_id
        join sys.schemas s on s.schema_id = t.schema_id
        join sys.columns col on col.object_id = t.object_id and col.column_id = fkc.parent_column_id
        join sys.tables rt on rt.object_id = c.referenced_object_id
        join sys.schemas rs on rs.schema_id = rt.schema_id
        join sys.columns rcol on rcol.object_id = rt.object_id and rcol.column_id = fkc.referenced_column_id
        where s.name = @schema and t.name = @table
      `),
    pool
      .request()
      .input("schema", sql.NVarChar, ref.schema)
      .input("table", sql.NVarChar, ref.name)
      .query(`
        select tc.CONSTRAINT_NAME as constraint_name, tc.CONSTRAINT_TYPE as constraint_type,
               kcu.COLUMN_NAME as column_name
        from INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        join INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
          on tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME and tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
        where tc.TABLE_SCHEMA = @schema and tc.TABLE_NAME = @table
          and tc.CONSTRAINT_TYPE in ('PRIMARY KEY','FOREIGN KEY','UNIQUE')
        order by tc.CONSTRAINT_TYPE, tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
      `),
    pool
      .request()
      .input("schema", sql.NVarChar, ref.schema)
      .input("table", sql.NVarChar, ref.name)
      .query(`
        select i.name as index_name, i.is_unique, c.name as column_name, ic.key_ordinal
        from sys.indexes i
        join sys.index_columns ic on ic.object_id = i.object_id and ic.index_id = i.index_id
        join sys.columns c on c.object_id = ic.object_id and c.column_id = ic.column_id
        join sys.tables t on t.object_id = i.object_id
        join sys.schemas s on s.schema_id = t.schema_id
        where s.name = @schema and t.name = @table
          and i.is_primary_key = 0 and i.is_hypothetical = 0 and i.name is not null
        order by i.name, ic.key_ordinal
      `),
  ]);

  const tableComment = (commentR.recordset[0]?.comment as string | null) || null;
  const pkSet = new Set(pkR.recordset.map((r: { column_name: string }) => r.column_name));
  const fkMap = new Map<string, string>();
  for (const r of fkR.recordset as {
    column_name: string;
    ref_schema: string;
    ref_table: string;
    ref_column: string;
  }[]) {
    fkMap.set(r.column_name, `${r.ref_schema}.${r.ref_table}.${r.ref_column}`);
  }

  const columns = colsR.recordset.map(
    (r: {
      ordinal_position: number;
      column_name: string;
      data_type: string;
      character_maximum_length: number | null;
      numeric_precision: number | null;
      numeric_scale: number | null;
      is_nullable: string;
      column_default: string | null;
      comment: string | null;
      is_identity: number;
    }) => ({
      ordinal: Number(r.ordinal_position),
      name: r.column_name,
      dataType: formatDataType(
        r.data_type,
        r.character_maximum_length,
        r.numeric_precision,
        r.numeric_scale,
      ),
      nullable: r.is_nullable === "YES",
      defaultValue: r.column_default,
      comment: r.comment,
      isPk: pkSet.has(r.column_name),
      isFk: fkMap.has(r.column_name),
      fkRef: fkMap.get(r.column_name) || null,
      identity: Number(r.is_identity) === 1,
      remark: null,
    }),
  );

  const constraintMap = new Map<string, TableMeta["constraints"][number]>();
  for (const r of cstR.recordset as {
    constraint_name: string;
    constraint_type: string;
    column_name: string;
  }[]) {
    const type =
      r.constraint_type === "PRIMARY KEY" ? "PK" : r.constraint_type === "FOREIGN KEY" ? "FK" : "UNIQUE";
    const existing = constraintMap.get(r.constraint_name);
    if (existing) existing.columns.push(r.column_name);
    else {
      const fk = (
        fkR.recordset as {
          constraint_name: string;
          ref_schema: string;
          ref_table: string;
          ref_column: string;
        }[]
      ).find((f) => f.constraint_name === r.constraint_name);
      constraintMap.set(r.constraint_name, {
        name: r.constraint_name,
        type,
        columns: [r.column_name],
        ref: fk ? `${fk.ref_schema}.${fk.ref_table}.${fk.ref_column}` : null,
        remark: null,
      });
    }
  }

  const indexMap = new Map<string, TableMeta["indexes"][number]>();
  for (const r of idxR.recordset as { index_name: string; is_unique: boolean; column_name: string }[]) {
    const existing = indexMap.get(r.index_name);
    if (existing) existing.columns.push(r.column_name);
    else {
      indexMap.set(r.index_name, {
        name: r.index_name,
        unique: Boolean(r.is_unique),
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

export const mssqlAdapter: DbAdapter = {
  async testConnection(params) {
    return withPool(params, async (pool) => {
      const r = await pool.request().query("select @@version as v");
      return { ok: true as const, serverVersion: String(r.recordset[0]?.v || "SQL Server") };
    });
  },

  async listSchemas(params) {
    return withPool(params, async (pool) => {
      const r = await pool.request().query(`
        select s.name
        from sys.schemas s
        where s.name not in ('sys','INFORMATION_SCHEMA','guest','db_owner','db_accessadmin',
          'db_securityadmin','db_ddladmin','db_backupoperator','db_datareader','db_datawriter',
          'db_denydatareader','db_denydatawriter')
        order by s.name
      `);
      return r.recordset.map((x: { name: string }) => x.name);
    });
  },

  async listTables(params, schema) {
    return withPool(params, async (pool) => {
      const r = await pool
        .request()
        .input("schema", sql.NVarChar, schema)
        .query(`
          select t.TABLE_SCHEMA as s, t.TABLE_NAME as n
          from INFORMATION_SCHEMA.TABLES t
          where t.TABLE_TYPE = 'BASE TABLE' and t.TABLE_SCHEMA = @schema
          order by t.TABLE_NAME
        `);
      return r.recordset.map((x: { s: string; n: string }) => ({ schema: x.s, name: x.n }));
    });
  },

  async collectTable(params, ref) {
    return withPool(params, (pool) => collectOnPool(pool, ref));
  },

  async collectTables(params, refs) {
    return withPool(params, (pool) =>
      collectTablesWithWorker(refs, 6, (ref) => collectOnPool(pool, ref)),
    );
  },
};
