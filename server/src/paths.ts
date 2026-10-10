import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_FOLDER = "table-define-doc";

export function defaultDataDirectory(): string {
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, APP_FOLDER);
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", APP_FOLDER);
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdg, APP_FOLDER);
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
