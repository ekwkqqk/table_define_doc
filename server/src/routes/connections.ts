import { Router } from "express";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { getAdapter } from "../adapters/index.js";
import { connectionToParams, inputToParams } from "../connectionParams.js";
import { encryptSecret } from "../crypto.js";
import {
  getConnection,
  getDataDirectory,
  listConnections,
  saveConnections,
} from "../storage.js";
import type { ConnectionConfig, ConnectionPublic, DbmsType } from "../types.js";

export const connectionsRouter = Router();

const dbmsEnum = z.enum(["postgresql", "mysql", "sqlite", "mssql", "oracle"]);

const connectionBody = z.object({
  name: z.string().min(1),
  dbms: dbmsEnum,
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  database: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  filePath: z.string().optional(),
  oracleConnectType: z.enum(["service", "sid"]).optional(),
  options: z.record(z.string()).optional(),
});

function toPublic(c: ConnectionConfig): ConnectionPublic {
  const { passwordEnc, ...rest } = c;
  return { ...rest, hasPassword: Boolean(passwordEnc) };
}

function defaultPort(dbms: DbmsType): number | undefined {
  switch (dbms) {
    case "postgresql":
      return 5432;
    case "mysql":
      return 3306;
    case "mssql":
      return 1433;
    case "oracle":
      return 1521;
    default:
      return undefined;
  }
}

connectionsRouter.get("/", (_req, res) => {
  res.json(listConnections().map(toPublic));
});

connectionsRouter.get("/:id", (req, res) => {
  const c = getConnection(req.params.id);
  if (!c) {
    res.status(404).json({ message: "연결을 찾을 수 없습니다." });
    return;
  }
  res.json(toPublic(c));
});

connectionsRouter.post("/", async (req, res) => {
  const parsed = connectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
    return;
  }
  const input = parsed.data;
  const now = new Date().toISOString();
  const item: ConnectionConfig = {
    id: uuid(),
    name: input.name,
    dbms: input.dbms,
    host: input.host || (input.dbms === "sqlite" ? undefined : "localhost"),
    port: input.port ?? defaultPort(input.dbms),
    database: input.database,
    user: input.user,
    filePath: input.filePath,
    oracleConnectType: input.oracleConnectType || "service",
    options: input.options,
    passwordEnc: input.password ? encryptSecret(getDataDirectory(), input.password) : undefined,
    createdAt: now,
    updatedAt: now,
  };
  const all = listConnections();
  all.push(item);
  saveConnections(all);
  res.status(201).json(toPublic(item));
});

connectionsRouter.put("/:id", (req, res) => {
  const parsed = connectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
    return;
  }
  const all = listConnections();
  const idx = all.findIndex((c) => c.id === req.params.id);
  if (idx < 0) {
    res.status(404).json({ message: "연결을 찾을 수 없습니다." });
    return;
  }
  const prev = all[idx];
  const input = parsed.data;
  const next: ConnectionConfig = {
    ...prev,
    name: input.name,
    dbms: input.dbms,
    host: input.host || (input.dbms === "sqlite" ? undefined : prev.host || "localhost"),
    port: input.port ?? defaultPort(input.dbms),
    database: input.database,
    user: input.user,
    filePath: input.filePath,
    oracleConnectType: input.oracleConnectType || prev.oracleConnectType || "service",
    options: input.options,
    updatedAt: new Date().toISOString(),
  };
  if (input.password) {
    next.passwordEnc = encryptSecret(getDataDirectory(), input.password);
  }
  all[idx] = next;
  saveConnections(all);
  res.json(toPublic(next));
});

connectionsRouter.delete("/:id", (req, res) => {
  const all = listConnections();
  const next = all.filter((c) => c.id !== req.params.id);
  if (next.length === all.length) {
    res.status(404).json({ message: "연결을 찾을 수 없습니다." });
    return;
  }
  saveConnections(next);
  res.status(204).end();
});

connectionsRouter.post("/test", async (req, res) => {
  const parsed = connectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
    return;
  }
  try {
    const adapter = await getAdapter(parsed.data.dbms);
    const result = await adapter.testConnection(inputToParams(parsed.data));
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, message: errorMessage(e) });
  }
});

connectionsRouter.post("/:id/test", async (req, res) => {
  const c = getConnection(req.params.id);
  if (!c) {
    res.status(404).json({ message: "연결을 찾을 수 없습니다." });
    return;
  }
  try {
    const password =
      typeof req.body?.password === "string" && req.body.password
        ? req.body.password
        : undefined;
    const adapter = await getAdapter(c.dbms);
    const result = await adapter.testConnection(connectionToParams(c, password));
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, message: errorMessage(e) });
  }
});

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "연결에 실패했습니다.";
}
