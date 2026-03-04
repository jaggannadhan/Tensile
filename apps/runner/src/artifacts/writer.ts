import fs from "node:fs/promises";
import path from "node:path";
import { toJson } from "../utils/json.js";

/** Assert a path is relative (no leading slash). Throws if absolute. */
export function assertRelativePath(p: string): void {
  if (path.isAbsolute(p)) {
    throw new Error(`Expected relative path but got absolute: ${p}`);
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/** Remove and recreate a directory so it starts clean. */
export async function ensureCleanDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeJsonFile(
  filePath: string,
  data: unknown,
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, toJson(data), "utf-8");
}

export async function appendLine(
  filePath: string,
  line: string,
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, line + "\n", "utf-8");
}

export async function writeTextFile(
  filePath: string,
  content: string,
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf-8");
}

export async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}
