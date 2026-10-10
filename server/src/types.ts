export type DbmsType = "postgresql" | "mysql" | "sqlite" | "mssql" | "oracle";

export interface ConnectionConfig {
  id: string;
  name: string;
  dbms: DbmsType;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  /** encrypted password ciphertext */
  passwordEnc?: string;
  /** SQLite file path */
  filePath?: string;
  /** Oracle service name or SID */
  oracleConnectType?: "service" | "sid";
  options?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionPublic extends Omit<ConnectionConfig, "passwordEnc"> {
  hasPassword: boolean;
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

export interface DocumentSettings {
  systemName: string;
  documentVersion: string;
  author: string;
  company: string;
  writtenAt: string;
}

export interface AppSettings {
  dataDirectory: string;
  document: DocumentSettings;
}

export interface ConnectParams {
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
