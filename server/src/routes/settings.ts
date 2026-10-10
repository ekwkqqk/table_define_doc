import { Router } from "express";
import { z } from "zod";
import { defaultDataDirectory } from "../paths.js";
import { getDataDirectory, readSettings, writeSettings } from "../storage.js";

export const settingsRouter = Router();

settingsRouter.get("/", (_req, res) => {
  res.json({
    ...readSettings(),
    defaultDataDirectory: defaultDataDirectory(),
    currentDataDirectory: getDataDirectory(),
  });
});

settingsRouter.put("/", (req, res) => {
  const schema = z.object({
    dataDirectory: z.string().min(1).optional(),
    document: z
      .object({
        systemName: z.string().optional(),
        documentVersion: z.string().optional(),
        author: z.string().optional(),
        company: z.string().optional(),
        writtenAt: z.string().optional(),
      })
      .optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "설정 값이 올바르지 않습니다.", issues: parsed.error.issues });
    return;
  }
  const current = readSettings();
  const next = writeSettings({
    dataDirectory: parsed.data.dataDirectory || current.dataDirectory,
    document: { ...current.document, ...(parsed.data.document || {}) },
  });
  res.json(next);
});
