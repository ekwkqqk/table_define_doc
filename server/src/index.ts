import cors from "cors";
import express from "express";
import { initStorage } from "./storage.js";
import { connectionsRouter } from "./routes/connections.js";
import { exploreRouter } from "./routes/explore.js";
import { exportRouter } from "./routes/export.js";
import { settingsRouter } from "./routes/settings.js";
import { snapshotsRouter } from "./routes/snapshots.js";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";

initStorage();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "table-define-doc", locale: "ko" });
});

app.use("/api/settings", settingsRouter);
app.use("/api/connections", connectionsRouter);
app.use("/api/explore", exploreRouter);
app.use("/api/snapshots", snapshotsRouter);
app.use("/api/export", exportRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: err instanceof Error ? err.message : "서버 오류" });
});

app.listen(PORT, HOST, () => {
  console.log(`테이블 정의서 API: http://${HOST}:${PORT}`);
});
