import type { ConnectParams, DbmsType } from "../types.js";
import type { DbAdapter } from "./base.js";

export async function getAdapter(dbms: DbmsType): Promise<DbAdapter> {
  switch (dbms) {
    case "postgresql":
      return (await import("./postgresql.js")).postgresqlAdapter;
    case "mysql":
      return (await import("./mysql.js")).mysqlAdapter;
    case "sqlite":
      return (await import("./sqlite.js")).sqliteAdapter;
    case "mssql":
      return (await import("./mssql.js")).mssqlAdapter;
    case "oracle":
      return (await import("./oracle.js")).oracleAdapter;
    default:
      throw new Error(`지원하지 않는 DBMS입니다: ${dbms}`);
  }
}

export function toConnectParams(
  input: ConnectParams & { password?: string },
): ConnectParams {
  return {
    dbms: input.dbms,
    host: input.host,
    port: input.port,
    database: input.database,
    user: input.user,
    password: input.password,
    filePath: input.filePath,
    oracleConnectType: input.oracleConnectType,
    options: input.options,
  };
}
