import type { ChildProcess } from "node:child_process";
import type { Response } from "express";
import type { RunIndex } from "@web-qa-agent/shared";
import type { RepoSpec, RepoMetaFile } from "./github/types.js";

export type RunStatus = "running" | "passed" | "failed" | "stopped" | "error";

export interface RunOptions {
  smoke?: boolean;
  discover?: boolean;
  journeys?: string;
  headless?: boolean;
  maxPages?: number;
  maxDepth?: number;
}

export interface StageStats {
  smoke?: { status: "pass" | "fail" | "skip"; durationMs?: number };
  discovery?: { status: "pass" | "fail" | "skip"; pages?: number; actions?: number; candidates?: number };
  journeys?: { status: "pass" | "fail" | "skip"; executed: number; passed: number; failed: number; skipped: number; warned: number };
}

export interface RunRecord {
  runId: string;
  targetUrl: string;
  status: RunStatus;
  outDir: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  options: RunOptions;
  projectSlug?: string;
  process?: ChildProcess;
  logLines: string[];
  sseClients: Set<Response>;
  indexReady: boolean;
  runIndex?: RunIndex;
  repos?: RepoSpec[];
  repoMeta?: RepoMetaFile;
  stages?: StageStats;
  issuesReady?: boolean;
}

const MAX_LOG_LINES = 500;
const MAX_CONCURRENT = 2;

const runs = new Map<string, RunRecord>();

function summarize(r: RunRecord) {
  return {
    runId: r.runId,
    targetUrl: r.targetUrl,
    status: r.status,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    indexReady: r.indexReady,
    options: r.options,
    repos: r.repos,
    stages: r.stages,
    projectSlug: r.projectSlug,
  };
}

export function broadcast(record: RunRecord, event: object): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of record.sseClients) {
    try {
      client.write(data);
    } catch {
      record.sseClients.delete(client);
    }
  }
}

export const registry = {
  size: () => runs.size,

  get: (id: string) => runs.get(id),

  list: () => Array.from(runs.values()).map(summarize),

  activeCount: () => {
    let count = 0;
    for (const r of runs.values()) {
      if (r.status === "running") count++;
    }
    return count;
  },

  canStart: () => {
    let count = 0;
    for (const r of runs.values()) {
      if (r.status === "running") count++;
    }
    return count < MAX_CONCURRENT;
  },

  create: (record: RunRecord) => {
    runs.set(record.runId, record);
  },

  appendLog: (id: string, line: string) => {
    const run = runs.get(id);
    if (!run) return;
    run.logLines.push(line);
    if (run.logLines.length > MAX_LOG_LINES) {
      run.logLines.shift();
    }
  },

  setStatus: (id: string, status: RunStatus, exitCode?: number) => {
    const run = runs.get(id);
    if (!run) return;
    run.status = status;
    run.exitCode = exitCode;
    if (status !== "running") {
      run.endedAt = new Date().toISOString();
    }
  },

  setExitCode: (id: string, exitCode: number) => {
    const run = runs.get(id);
    if (!run) return;
    run.exitCode = exitCode;
  },

  setIndexReady: (id: string, index: RunIndex) => {
    const run = runs.get(id);
    if (!run) return;
    run.indexReady = true;
    run.runIndex = index;
  },

  setRepoMeta: (id: string, meta: RepoMetaFile) => {
    const run = runs.get(id);
    if (!run) return;
    run.repoMeta = meta;
  },

  setStages: (id: string, stages: StageStats) => {
    const run = runs.get(id);
    if (!run) return;
    run.stages = stages;
  },

  setIssuesReady: (id: string) => {
    const run = runs.get(id);
    if (!run) return;
    run.issuesReady = true;
  },

  /** Restore a completed run from disk (startup scan). */
  restore: (partial: {
    runId: string;
    projectSlug: string;
    targetUrl: string;
    status: RunStatus;
    outDir: string;
    startedAt: string;
    endedAt?: string;
    exitCode?: number;
    options: RunOptions;
  }) => {
    const record: RunRecord = {
      ...partial,
      logLines: [],
      sseClients: new Set(),
      indexReady: false,
    };
    runs.set(record.runId, record);
  },

  /** List runs belonging to a specific project slug. */
  listByProject: (slug: string) => {
    return Array.from(runs.values())
      .filter((r) => r.projectSlug === slug)
      .map(summarize);
  },

  /** Remove all non-running runs from memory (for rescan). */
  clearNonRunning: () => {
    for (const [id, r] of runs) {
      if (r.status !== "running") runs.delete(id);
    }
  },

  /** Remove a single run from memory (does not delete disk). */
  remove: (id: string) => {
    runs.delete(id);
  },
};
