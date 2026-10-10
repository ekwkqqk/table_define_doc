import { Router } from "express";
import { buildExcel } from "../export/excel.js";
import { buildMarkdown } from "../export/markdown.js";
import { getConnection, getSnapshot, readSettings } from "../storage.js";

export const exportRouter = Router();

exportRouter.get("/:snapshotId/markdown", (req, res) => {
  const snapshot = getSnapshot(req.params.snapshotId);
  if (!snapshot) {
    res.status(404).json({ message: "스냅샷을 찾을 수 없습니다." });
    return;
  }
  const conn = getConnection(snapshot.connectionId);
  const doc = readSettings().document;
  const md = buildMarkdown(snapshot, doc, {
    connectionName: conn?.name || snapshot.connectionId,
    dbms: conn?.dbms || "",
    database: conn?.database || conn?.filePath,
  });
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="table-definition-${snapshot.id}.md"`,
  );
  res.send(md);
});

exportRouter.get("/:snapshotId/excel", async (req, res) => {
  const snapshot = getSnapshot(req.params.snapshotId);
  if (!snapshot) {
    res.status(404).json({ message: "스냅샷을 찾을 수 없습니다." });
    return;
  }
  const conn = getConnection(snapshot.connectionId);
  const doc = readSettings().document;
  try {
    const buf = await buildExcel(snapshot, doc, {
      connectionName: conn?.name || snapshot.connectionId,
      dbms: conn?.dbms || "",
      database: conn?.database || conn?.filePath,
    });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="table-definition-${snapshot.id}.xlsx"`,
    );
    res.send(buf);
  } catch (e) {
    res.status(500).json({ message: e instanceof Error ? e.message : "Excel 생성 실패" });
  }
});
