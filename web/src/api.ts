export type DbmsType = "postgresql" | "mysql" | "sqlite" | "mssql" | "oracle";

export interface Connection {
  id: string;
  name: string;
  dbms: DbmsType;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  filePath?: string;
  oracleConnectType?: "service" | "sid";
  options?: Record<string, string>;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionInput {
  name: string;
  dbms: DbmsType;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  filePath?: string;
  oracleConnectType?: "service" | "sid";
  options?: Record<string, string>;
}

export interface TableRef {
  schema: string;
  name: string;
}

export interface ColumnMeta {
  ordinal: number;
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  comment: string | null;
  isPk: boolean;
  isFk: boolean;
  fkRef: string | null;
  identity: boolean;
  remark: string | null;
}

export interface ConstraintMeta {
  name: string;
  type: "PK" | "FK" | "UNIQUE";
  columns: string[];
  ref: string | null;
  remark: string | null;
}

export interface IndexMeta {
  name: string;
  unique: boolean;
  columns: string[];
  remark: string | null;
}

export interface TableMeta {
  schema: string;
  name: string;
  comment: string | null;
  columns: ColumnMeta[];
  constraints: ConstraintMeta[];
  indexes: IndexMeta[];
}

export interface Snapshot {
  id: string;
  connectionId: string;
  collectedAt: string;
  status: "success" | "partial" | "failed";
  tables: TableMeta[];
  failures: { schema: string; name: string; error: string }[];
  selected: TableRef[];
}

export interface AppSettings {
  dataDirectory: string;
  defaultDataDirectory?: string;
  currentDataDirectory?: string;
  document: {
    systemName: string;
    documentVersion: string;
    author: string;
    company: string;
    writtenAt: string;
  };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ ok: boolean }>("/api/health"),
  listConnections: () => request<Connection[]>("/api/connections"),
  createConnection: (body: ConnectionInput) =>
    request<Connection>("/api/connections", { method: "POST", body: JSON.stringify(body) }),
  updateConnection: (id: string, body: ConnectionInput) =>
    request<Connection>(`/api/connections/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteConnection: (id: string) =>
    request<void>(`/api/connections/${id}`, { method: "DELETE" }),
  testConnection: (body: ConnectionInput) =>
    request<{ ok: boolean; serverVersion?: string; message?: string }>("/api/connections/test", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  testSavedConnection: (id: string) =>
    request<{ ok: boolean; serverVersion?: string; message?: string }>(`/api/connections/${id}/test`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  listSchemas: (connectionId: string) =>
    request<string[]>(`/api/explore/${connectionId}/schemas`),
  listTables: (connectionId: string, schema: string, q = "") =>
    request<TableRef[]>(
      `/api/explore/${connectionId}/tables?schema=${encodeURIComponent(schema)}&q=${encodeURIComponent(q)}`,
    ),
  collect: (connectionId: string, tables: TableRef[]) =>
    request<Snapshot>("/api/snapshots/collect", {
      method: "POST",
      body: JSON.stringify({ connectionId, tables }),
    }),
  getSnapshot: (id: string) => request<Snapshot>(`/api/snapshots/${id}`),
  resync: (id: string) =>
    request<Snapshot>(`/api/snapshots/${id}/resync`, { method: "POST", body: "{}" }),
  getSettings: () => request<AppSettings>("/api/settings"),
  saveSettings: (body: Partial<AppSettings>) =>
    request<AppSettings>("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
  exportMarkdownUrl: (snapshotId: string) => `/api/export/${snapshotId}/markdown`,
  exportExcelUrl: (snapshotId: string) => `/api/export/${snapshotId}/excel`,
};

export const DBMS_LABELS: Record<DbmsType, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL / MariaDB",
  sqlite: "SQLite",
  mssql: "Microsoft SQL Server",
  oracle: "Oracle",
};
