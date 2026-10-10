import fs from "node:fs";
import path from "node:path";
import { defaultDataDirectory, ensureDir } from "./paths.js";
import type { AppSettings, ConnectionConfig, DocumentSettings, Snapshot } from "./types.js";

const SETTINGS_FILE = "settings.json";
const CONNECTIONS_FILE = "connections.json";
const SNAPSHOTS_DIR = "snapshots";

let dataDirectory = defaultDataDirectory();

const defaultDocument = (): DocumentSettings => ({
  systemName: "",
  documentVersion: "1.0",
  author: "",
  company: "",
  writtenAt: new Date().toISOString().slice(0, 10),
});

export function getDataDirectory(): string {
  return dataDirectory;
}

export function initStorage(customDir?: string): AppSettings {
  if (customDir) {
    dataDirectory = customDir;
  } else {
    const bootstrap = path.join(defaultDataDirectory(), SETTINGS_FILE);
    if (fs.existsSync(bootstrap)) {
      try {
        const raw = JSON.parse(fs.readFileSync(bootstrap, "utf8")) as AppSettings;
        if (raw.dataDirectory) dataDirectory = raw.dataDirectory;
      } catch {
        /* use default */
      }
    }
  }
  ensureDir(dataDirectory);
  ensureDir(path.join(dataDirectory, SNAPSHOTS_DIR));
  const settings = readSettings();
  if (!fs.existsSync(settingsPath())) {
    writeSettings(settings);
  }
  return settings;
}

function settingsPath(): string {
  return path.join(dataDirectory, SETTINGS_FILE);
}

function connectionsPath(): string {
  return path.join(dataDirectory, CONNECTIONS_FILE);
}

export function readSettings(): AppSettings {
  if (!fs.existsSync(settingsPath())) {
    return { dataDirectory, document: defaultDocument() };
  }
  const raw = JSON.parse(fs.readFileSync(settingsPath(), "utf8")) as AppSettings;
  return {
    dataDirectory: raw.dataDirectory || dataDirectory,
    document: { ...defaultDocument(), ...(raw.document || {}) },
  };
}

export function writeSettings(settings: AppSettings): AppSettings {
  const nextDir = settings.dataDirectory || dataDirectory;
  if (path.resolve(nextDir) !== path.resolve(dataDirectory)) {
    ensureDir(nextDir);
    ensureDir(path.join(nextDir, SNAPSHOTS_DIR));
    // migrate key files if present
    for (const file of [CONNECTIONS_FILE, "secret.key"]) {
      const from = path.join(dataDirectory, file);
      const to = path.join(nextDir, file);
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.copyFileSync(from, to);
      }
    }
    dataDirectory = nextDir;
  }
  ensureDir(dataDirectory);
  const payload: AppSettings = {
    dataDirectory,
    document: { ...defaultDocument(), ...settings.document },
  };
  fs.writeFileSync(settingsPath(), JSON.stringify(payload, null, 2), "utf8");
  // also keep pointer in default location if custom
  const defaultDir = defaultDataDirectory();
  if (path.resolve(dataDirectory) !== path.resolve(defaultDir)) {
    ensureDir(defaultDir);
    fs.writeFileSync(
      path.join(defaultDir, SETTINGS_FILE),
      JSON.stringify({ dataDirectory, document: payload.document }, null, 2),
      "utf8",
    );
  }
  return payload;
}

export function listConnections(): ConnectionConfig[] {
  if (!fs.existsSync(connectionsPath())) return [];
  return JSON.parse(fs.readFileSync(connectionsPath(), "utf8")) as ConnectionConfig[];
}

export function saveConnections(items: ConnectionConfig[]): void {
  ensureDir(dataDirectory);
  fs.writeFileSync(connectionsPath(), JSON.stringify(items, null, 2), "utf8");
}

export function getConnection(id: string): ConnectionConfig | undefined {
  return listConnections().find((c) => c.id === id);
}

export function saveSnapshot(snapshot: Snapshot): void {
  ensureDir(path.join(dataDirectory, SNAPSHOTS_DIR));
  const file = path.join(dataDirectory, SNAPSHOTS_DIR, `${snapshot.id}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), "utf8");
}

export function getSnapshot(id: string): Snapshot | undefined {
  const file = path.join(dataDirectory, SNAPSHOTS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8")) as Snapshot;
}

export function listSnapshots(connectionId?: string): Snapshot[] {
  const dir = path.join(dataDirectory, SNAPSHOTS_DIR);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const items = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Snapshot);
  return items
    .filter((s) => !connectionId || s.connectionId === connectionId)
    .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
}
