import oracledb from "oracledb";
import type { ConnectParams, TableMeta, TableRef } from "../types.js";
import { formatDataType, type DbAdapter } from "./base.js";
import type { CollectResult } from "./collect.js";

function connectStringOf(params: ConnectParams): string {
  const host = params.host || "localhost";
  const port = params.port || 1521;
  const db = params.database || "ORCL";
  return params.oracleConnectType === "sid"
    ? `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${host})(PORT=${port}))(CONNECT_DATA=(SID=${db})))`
    : `${host}:${port}/${db}`;
}

async function getConn(params: ConnectParams) {
  return oracledb.getConnection({
    user: params.user,
    password: params.password,
    connectString: connectStringOf(params),
  });
}

async function collectOnConn(c: oracledb.Connection, ref: TableRef): Promise<TableMeta> {
  const owner = ref.schema.toUpperCase();
  const table = ref.name.toUpperCase();
  const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT } as const;
  const binds = { owner, table_name: table };

  const [commentR, colsR, pkR, fkR, cstR, idxR] = await Promise.all([
    c.execute<{ COMMENTS: string | null }>(
      `select comments from all_tab_comments where owner = :owner and table_name = :table_name`,
      binds,
      opts,
    ),
    c.execute<{
      COLUMN_ID: number;
      COLUMN_NAME: string;
      DATA_TYPE: string;
      DATA_LENGTH: number;
      DATA_PRECISION: number | null;
      DATA_SCALE: number | null;
      NULLABLE: string;
      DATA_DEFAULT: string | null;
      COMMENTS: string | null;
      IDENTITY_COLUMN: string;
    }>(
      `select
         c.column_id, c.column_name, c.data_type, c.data_length, c.data_precision, c.data_scale,
         c.nullable, c.data_default, cc.comments,
         nvl(c.identity_column, 'NO') as identity_column
       from all_tab_columns c
       left join all_col_comments cc
         on cc.owner = c.owner and cc.table_name = c.table_name and cc.column_name = c.column_name
       where c.owner = :owner and c.table_name = :table_name
       order by c.column_id`,
      binds,
      opts,
    ),
    c.execute<{ COLUMN_NAME: string }>(
      `select cols.column_name
       from all_constraints cons
       join all_cons_columns cols
         on cons.owner = cols.owner and cons.constraint_name = cols.constraint_name
       where cons.constraint_type = 'P' and cons.owner = :owner and cons.table_name = :table_name
       order by cols.position`,
      binds,
      opts,
    ),
    c.execute<{
      CONSTRAINT_NAME: string;
      COLUMN_NAME: string;
      R_OWNER: string;
      R_TABLE_NAME: string;
      R_COLUMN_NAME: string;
    }>(
      `select
         a.constraint_name, a.column_name,
         c_pk.owner as r_owner, c_pk.table_name as r_table_name, b.column_name as r_column_name
       from all_cons_columns a
       join all_constraints c on a.owner = c.owner and a.constraint_name = c.constraint_name
       join all_constraints c_pk on c.r_owner = c_pk.owner and c.r_constraint_name = c_pk.constraint_name
       join all_cons_columns b on c_pk.owner = b.owner and c_pk.constraint_name = b.constraint_name and b.position = a.position
       where c.constraint_type = 'R' and a.owner = :owner and a.table_name = :table_name`,
      binds,
      opts,
    ),
    c.execute<{
      CONSTRAINT_NAME: string;
      CONSTRAINT_TYPE: string;
      COLUMN_NAME: string;
    }>(
      `select cons.constraint_name, cons.constraint_type, cols.column_name
       from all_constraints cons
       join all_cons_columns cols
         on cons.owner = cols.owner and cons.constraint_name = cols.constraint_name
       where cons.owner = :owner and cons.table_name = :table_name
         and cons.constraint_type in ('P','R','U')
       order by cons.constraint_type, cons.constraint_name, cols.position`,
      binds,
      opts,
    ),
    c.execute<{
      INDEX_NAME: string;
      UNIQUENESS: string;
      COLUMN_NAME: string;
    }>(
      `select i.index_name, i.uniqueness, ic.column_name
       from all_indexes i
       join all_ind_columns ic
         on i.owner = ic.index_owner and i.index_name = ic.index_name
       where i.table_owner = :owner and i.table_name = :table_name
         and i.index_name not in (
           select constraint_name from all_constraints
           where owner = :owner and table_name = :table_name and constraint_type = 'P'
         )
       order by i.index_name, ic.column_position`,
      binds,
      opts,
    ),
  ]);

  const tableComment = commentR.rows?.[0]?.COMMENTS || null;
  const pkSet = new Set((pkR.rows || []).map((r) => r.COLUMN_NAME));
  const fkMap = new Map<string, string>();
  for (const r of fkR.rows || []) {
    fkMap.set(r.COLUMN_NAME, `${r.R_OWNER}.${r.R_TABLE_NAME}.${r.R_COLUMN_NAME}`);
  }

  const columns = (colsR.rows || []).map((r) => ({
    ordinal: Number(r.COLUMN_ID),
    name: r.COLUMN_NAME,
    dataType: formatDataType(r.DATA_TYPE, r.DATA_LENGTH, r.DATA_PRECISION, r.DATA_SCALE),
    nullable: r.NULLABLE === "Y",
    defaultValue: r.DATA_DEFAULT == null ? null : String(r.DATA_DEFAULT).trim(),
    comment: r.COMMENTS,
    isPk: pkSet.has(r.COLUMN_NAME),
    isFk: fkMap.has(r.COLUMN_NAME),
    fkRef: fkMap.get(r.COLUMN_NAME) || null,
    identity: r.IDENTITY_COLUMN === "YES",
    remark: null,
  }));

  const constraintMap = new Map<string, TableMeta["constraints"][number]>();
  for (const r of cstR.rows || []) {
    const type = r.CONSTRAINT_TYPE === "P" ? "PK" : r.CONSTRAINT_TYPE === "R" ? "FK" : "UNIQUE";
    const existing = constraintMap.get(r.CONSTRAINT_NAME);
    if (existing) existing.columns.push(r.COLUMN_NAME);
    else {
      const fk = (fkR.rows || []).find((f) => f.CONSTRAINT_NAME === r.CONSTRAINT_NAME);
      constraintMap.set(r.CONSTRAINT_NAME, {
        name: r.CONSTRAINT_NAME,
        type,
        columns: [r.COLUMN_NAME],
        ref: fk ? `${fk.R_OWNER}.${fk.R_TABLE_NAME}.${fk.R_COLUMN_NAME}` : null,
        remark: null,
      });
    }
  }

  const indexMap = new Map<string, TableMeta["indexes"][number]>();
  for (const r of idxR.rows || []) {
    const existing = indexMap.get(r.INDEX_NAME);
    if (existing) existing.columns.push(r.COLUMN_NAME);
    else {
      indexMap.set(r.INDEX_NAME, {
        name: r.INDEX_NAME,
        unique: r.UNIQUENESS === "UNIQUE",
        columns: [r.COLUMN_NAME],
        remark: null,
      });
    }
  }

  return {
    schema: owner,
    name: table,
    comment: tableComment,
    columns,
    constraints: [...constraintMap.values()],
    indexes: [...indexMap.values()],
  };
}

export const oracleAdapter: DbAdapter = {
  async testConnection(params) {
    const c = await getConn(params);
    try {
      const r = await c.execute<{ V: string }>("select banner as v from v$version where rownum = 1", [], {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      const v = r.rows?.[0]?.V || "Oracle";
      return { ok: true, serverVersion: String(v) };
    } finally {
      await c.close();
    }
  },

  async listSchemas(params) {
    const c = await getConn(params);
    try {
      const r = await c.execute<{ USERNAME: string }>(
        `select username from all_users
         where oracle_maintained = 'N'
         order by username`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const users = (r.rows || []).map((x) => x.USERNAME);
      if (users.length) return users;
      const me = await c.execute<{ U: string }>("select user as u from dual", [], {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      return me.rows?.[0]?.U ? [me.rows[0].U] : [];
    } finally {
      await c.close();
    }
  },

  async listTables(params, schema) {
    const c = await getConn(params);
    try {
      const r = await c.execute<{ OWNER: string; TABLE_NAME: string }>(
        `select owner, table_name from all_tables
         where owner = :owner
         order by table_name`,
        { owner: schema.toUpperCase() },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      return (r.rows || []).map((x) => ({ schema: x.OWNER, name: x.TABLE_NAME }));
    } finally {
      await c.close();
    }
  },

  async collectTable(params, ref) {
    const c = await getConn(params);
    try {
      return await collectOnConn(c, ref);
    } finally {
      await c.close();
    }
  },

  async collectTables(params, refs): Promise<CollectResult> {
    // Oracle thin mode: reuse one connection sequentially (avoids pool overhead / session storms)
    const c = await getConn(params);
    const tables: TableMeta[] = [];
    const failures: CollectResult["failures"] = [];
    try {
      for (const ref of refs) {
        try {
          tables.push(await collectOnConn(c, ref));
        } catch (e) {
          failures.push({
            schema: ref.schema,
            name: ref.name,
            error: e instanceof Error ? e.message : "수집 실패",
          });
        }
      }
    } finally {
      await c.close();
    }
    return { tables, failures };
  },
};
