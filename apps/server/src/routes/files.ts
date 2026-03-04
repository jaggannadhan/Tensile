import { Router, type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { registry } from "../registry.js";

export const filesRouter = Router();

const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json",
  ".jsonl": "text/plain; charset=utf-8",
  ".zip": "application/zip",
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".log": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};

async function serveArtifact(outDir: string, subPath: string, res: Response): Promise<void> {
  if (!subPath) {
    res.status(400).json({ error: "No file path specified" });
    return;
  }

  // Path traversal protection
  const resolved = path.resolve(outDir, subPath);
  if (!resolved.startsWith(outDir + path.sep) && resolved !== outDir) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  try {
    await fs.access(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.sendFile(resolved);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
}

// GET /runs/:slug/:id/* — project-scoped artifact files
filesRouter.get("/:slug/:id/*", async (req: Request, res: Response) => {
  const run = registry.get(req.params.id as string);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  await serveArtifact(run.outDir, req.params[0], res);
});

// GET /runs/:id/* — legacy flat artifact files (backward compat)
filesRouter.get("/:id/*", async (req: Request, res: Response) => {
  const run = registry.get(req.params.id as string);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  await serveArtifact(run.outDir, req.params[0], res);
});
