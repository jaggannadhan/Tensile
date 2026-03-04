import fs from "node:fs/promises";
import path from "node:path";
import { registry, type RunOptions, type RunStatus } from "./registry.js";

export interface Project {
  slug: string;
  targetUrl: string;
  runCount: number;
  lastRunAt: string;
}

/** Derive a project slug from a target URL: hostname (dots→hyphens) + "__" + first path segment. */
export function deriveProjectSlug(url: string): string {
  const u = new URL(url);
  const host = u.hostname.replace(/\./g, "-");
  const firstSegment = u.pathname.split("/").filter(Boolean)[0] || "root";
  return `${host}__${firstSegment}`;
}

/** Scan data/runs/ on startup — restore completed runs into registry. */
export async function scanProjects(dataDir: string): Promise<void> {
  let projectDirs: string[];
  try {
    projectDirs = await fs.readdir(dataDir);
  } catch {
    return;
  }

  for (const slug of projectDirs) {
    const slugDir = path.join(dataDir, slug);
    const stat = await fs.stat(slugDir).catch(() => null);
    if (!stat?.isDirectory()) continue;

    // Check if this is old flat layout (has run.index.json directly — not a project dir)
    const oldIndex = path.join(slugDir, "run.index.json");
    const isOldFlat = await fs
      .access(oldIndex)
      .then(() => true)
      .catch(() => false);
    if (isOldFlat) continue;

    let runDirs: string[];
    try {
      runDirs = await fs.readdir(slugDir);
    } catch {
      continue;
    }

    for (const runId of runDirs) {
      const runDir = path.join(slugDir, runId);
      const runStat = await fs.stat(runDir).catch(() => null);
      if (!runStat?.isDirectory()) continue;

      // Read run.json metadata
      try {
        const raw = await fs.readFile(path.join(runDir, "run.json"), "utf-8");
        const meta = JSON.parse(raw) as {
          runId: string;
          projectSlug: string;
          targetUrl: string;
          startedAt: string;
          endedAt?: string;
          status?: RunStatus;
          exitCode?: number;
          options?: RunOptions;
        };
        // Only restore if not already in registry (e.g. running runs)
        if (registry.get(runId)) continue;
        registry.restore({
          runId,
          projectSlug: slug,
          targetUrl: meta.targetUrl,
          status: meta.status ?? "error",
          outDir: runDir,
          startedAt: meta.startedAt,
          endedAt: meta.endedAt,
          exitCode: meta.exitCode,
          options: meta.options ?? {},
        });
      } catch {
        /* skip unreadable */
      }
    }
  }
}

/** List all projects aggregated from registry runs. */
export function listProjects(): Project[] {
  const allRuns = registry.list();
  const projectMap = new Map<string, Project>();
  for (const run of allRuns) {
    const slug = run.projectSlug;
    if (!slug) continue;
    const existing = projectMap.get(slug);
    if (!existing) {
      projectMap.set(slug, {
        slug,
        targetUrl: run.targetUrl,
        runCount: 1,
        lastRunAt: run.startedAt,
      });
    } else {
      existing.runCount++;
      if (run.startedAt > existing.lastRunAt) {
        existing.lastRunAt = run.startedAt;
      }
    }
  }
  return Array.from(projectMap.values()).sort((a, b) =>
    b.lastRunAt.localeCompare(a.lastRunAt),
  );
}
