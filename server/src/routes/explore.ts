import { Router } from "express";
import { getAdapter } from "../adapters/index.js";
import { connectionToParams } from "../connectionParams.js";
import { getConnection } from "../storage.js";

export const exploreRouter = Router();

exploreRouter.get("/:connectionId/schemas", async (req, res) => {
  const c = getConnection(req.params.connectionId);
  if (!c) {
    res.status(404).json({ message: "연결을 찾을 수 없습니다." });
    return;
  }
  try {
    const adapter = await getAdapter(c.dbms);
    const schemas = await adapter.listSchemas(connectionToParams(c));
    res.json(schemas);
  } catch (e) {
    res.status(400).json({ message: e instanceof Error ? e.message : "스키마 조회 실패" });
  }
});

exploreRouter.get("/:connectionId/tables", async (req, res) => {
  const c = getConnection(req.params.connectionId);
  if (!c) {
    res.status(404).json({ message: "연결을 찾을 수 없습니다." });
    return;
  }
  const schema = String(req.query.schema || "");
  if (!schema) {
    res.status(400).json({ message: "schema 쿼리 파라미터가 필요합니다." });
    return;
  }
  try {
    const adapter = await getAdapter(c.dbms);
    const tables = await adapter.listTables(connectionToParams(c), schema);
    const q = String(req.query.q || "").toLowerCase();
    res.json(q ? tables.filter((t) => t.name.toLowerCase().includes(q)) : tables);
  } catch (e) {
    res.status(400).json({ message: e instanceof Error ? e.message : "테이블 조회 실패" });
  }
});
