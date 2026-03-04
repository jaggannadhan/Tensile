import fs from "node:fs/promises";
import { artifactsDir, logsDir, reportsDir } from "./paths.js";

export async function initRunDirectory(outDir: string): Promise<void> {
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(artifactsDir(outDir), { recursive: true });
  await fs.mkdir(logsDir(outDir), { recursive: true });
  await fs.mkdir(reportsDir(outDir), { recursive: true });
}
