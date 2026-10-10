import { decryptSecret } from "./crypto.js";
import { getDataDirectory } from "./storage.js";
import type { ConnectionConfig, ConnectParams, ConnectionInput } from "./types.js";

export function connectionToParams(
  conn: ConnectionConfig,
  passwordOverride?: string,
): ConnectParams {
  let password = passwordOverride;
  if (password == null && conn.passwordEnc) {
    password = decryptSecret(getDataDirectory(), conn.passwordEnc);
  }
  return {
    dbms: conn.dbms,
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    password,
    filePath: conn.filePath,
    oracleConnectType: conn.oracleConnectType,
    options: conn.options,
  };
}

export function inputToParams(input: ConnectionInput): ConnectParams {
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
