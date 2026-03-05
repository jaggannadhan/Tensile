import { Router, type Request, type Response } from "express";
import { registry } from "../registry.js";
import { scanProjects, listProjects } from "../projects.js";

export function createAdminRouter(dataDir: string) {
  const router = Router();

  // POST /api/admin/rescan — clear non-running runs from memory, re-scan disk
  router.post("/rescan", async (_req: Request, res: Response) => {
    try {
      registry.clearNonRunning();
      await scanProjects(dataDir);
      const projects = listProjects();
      res.json({ projects: projects.length, runs: registry.size() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // POST /api/admin/forget-run — remove a single run from memory (no disk delete)
  router.post("/forget-run", (req: Request, res: Response) => {
    const { runId } = req.body as { runId?: string };
    if (!runId || typeof runId !== "string") {
      res.status(400).json({ error: "runId is required" });
      return;
    }
    const run = registry.get(runId);
    if (!run) {
      res.status(404).json({ error: "Run not found in registry" });
      return;
    }
    if (run.status === "running") {
      res.status(409).json({ error: "Cannot forget a running run. Stop it first." });
      return;
    }
    registry.remove(runId);
    res.json({ removed: runId });
  });

  return router;
}
