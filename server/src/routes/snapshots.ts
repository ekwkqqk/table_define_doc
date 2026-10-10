import { Router } from "express";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { getAdapter } from "../adapters/index.js";
import { connectionToParams } from "../connectionParams.js";
import {
  getConnection,
  getSnapshot,
  listSnapshots,
  saveSnapshot,
} from "../storage.js";
import type { Snapshot, TableRef } from "../types.js";

export const snapshotsRouter = Router();

const collectBody = z.object({
  connectionId: z.string().min(1),
  tables: z.array(z.object({ schema: z.string(), name: z.string() })).min(1),
});

async function buildSnapshot(
  connectionId: string,
  selected: TableRef[],
): Promise<Snapshot> {
  const conn = getConnection(connectionId);
  if (!conn) {
    throw Object.assign(new Error("연결을 찾을 수 없습니다."), { status: 404 });
  }

  const adapter = await getAdapter(conn.dbms);
  const { tables, failures } = await adapter.collectTables(
    connectionToParams(conn),
    selected,
  );

  const status: Snapshot["status"] =
    failures.length === 0 ? "success" : tables.length ? "partial" : "failed";

  const snapshot: Snapshot = {
    id: uuid(),
    connectionId: conn.id,
    collectedAt: new Date().toISOString(),
    status,
    tables,
    failures,
    selected,
  };
  saveSnapshot(snapshot);
  return snapshot;
}

snapshotsRouter.get("/", (req, res) => {
  const connectionId = req.query.connectionId ? String(req.query.connectionId) : undefined;
  res.json(
    listSnapshots(connectionId).map((s) => ({
      id: s.id,
      connectionId: s.connectionId,
      collectedAt: s.collectedAt,
      status: s.status,
      tableCount: s.tables.length,
      failureCount: s.failures.length,
      selected: s.selected,
    })),
  );
});

snapshotsRouter.get("/:id", (req, res) => {
  const s = getSnapshot(req.params.id);
  if (!s) {
    res.status(404).json({ message: "스냅샷을 찾을 수 없습니다." });
    return;
  }
  res.json(s);
});

snapshotsRouter.post("/collect", async (req, res) => {
  const parsed = collectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "입력값이 올바르지 않습니다.", issues: parsed.error.issues });
    return;
  }
  try {
    const snapshot = await buildSnapshot(parsed.data.connectionId, parsed.data.tables);
    res.status(201).json(snapshot);
  } catch (e) {
    const status = (e as { status?: number }).status || 400;
    res.status(status).json({ message: e instanceof Error ? e.message : "수집 실패" });
  }
});

snapshotsRouter.post("/:id/resync", async (req, res) => {
  const prev = getSnapshot(req.params.id);
  if (!prev) {
    res.status(404).json({ message: "스냅샷을 찾을 수 없습니다." });
    return;
  }
  try {
    const snapshot = await buildSnapshot(prev.connectionId, prev.selected);
    res.status(201).json(snapshot);
  } catch (e) {
    const status = (e as { status?: number }).status || 400;
    res.status(status).json({ message: e instanceof Error ? e.message : "재동기화 실패" });
  }
});
