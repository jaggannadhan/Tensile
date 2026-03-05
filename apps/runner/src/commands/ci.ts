import type { Command } from "commander";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import { loadCiConfig } from "../ci/config.js";
import type { CiTarget } from "../ci/config.js";
import { deriveProjectSlug } from "../ci/slug.js";
import { computeIssuesForCi } from "../ci/triage.js";
import type { IssuesFile } from "../ci/triage.js";
import {
  buildTargetResult,
  buildCiSummary,
  writeSummary,
} from "../ci/summarize.js";
import type { TargetResult } from "../ci/summarize.js";
import { writeReport } from "../ci/markdown.js";

let runnerScriptPath = path.resolve(__dirname, "../index.js");

export function setRunnerScriptPath(p: string): void {
  runnerScriptPath = p;
}

interface RunIndex {
  journeys: Array<{
    journeyId: string;
    name: string;
    status: string;
    durationMs: number;
    resultPath: string;
  }>;
}

function buildArgs(target: CiTarget, outDir: string): string[] {
  const args = ["run", "--url", target.url, "--out", outDir];
  const opts = target.options;

  if (opts.headless !== false) args.push("--headless");
  if (opts.smoke === false) args.push("--no-smoke");
  if (opts.discover === false) args.push("--no-discover");
  if (opts.readOnly) args.push("--read-only");
  if (opts.journeys) args.push("--journeys", opts.journeys);
  if (opts.maxPages) args.push("--max-pages", String(opts.maxPages));
  if (opts.maxDepth) args.push("--max-depth", String(opts.maxDepth));

  return args;
}

function spawnRunner(args: string[], prefix: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("node", [runnerScriptPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (line) console.log(`[${prefix}] ${line}`);
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (line) console.error(`[${prefix}] ${line}`);
      }
    });

    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(3));
  });
}

async function readRunIndex(outDir: string): Promise<RunIndex | null> {
  try {
    const raw = await fs.readFile(path.join(outDir, "run.index.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function registerCiCommand(program: Command): void {
  program
    .command("ci")
    .description("Run Tensile CI — iterate targets from config and produce summary artifacts")
    .option("--config <path>", "Path to tensile.config.json", "tensile.config.json")
    .option("--out <dir>", "Output directory for CI run artifacts", "./ci-runs")
    .action(async (opts: { config: string; out: string }) => {
      let config;
      try {
        config = await loadCiConfig(opts.config);
      } catch (err) {
        console.error(`Failed to load config from ${opts.config}:`, (err as Error).message);
        process.exit(2);
      }

      const outRoot = path.resolve(opts.out);
      await fs.mkdir(outRoot, { recursive: true });

      console.log(`Tensile CI — ${config.targets.length} target(s)`);
      console.log(`Output: ${outRoot}`);
      console.log(`Fail on: ${config.ci.failOn}`);
      console.log("");

      const targetResults: TargetResult[] = [];

      for (const target of config.targets) {
        const slug = deriveProjectSlug(target.url);
        const runId = uuid();
        const targetOutDir = path.join(outRoot, slug, runId);
        await fs.mkdir(targetOutDir, { recursive: true });

        console.log(`── Target: ${target.name} (${target.url})`);
        console.log(`   Run ID: ${runId}`);
        console.log(`   Output: ${targetOutDir}`);

        const args = buildArgs(target, targetOutDir);
        const exitCode = await spawnRunner(args, target.name);
        console.log(`   Exit code: ${exitCode}`);

        // Read run index + compute issues
        const runIndex = await readRunIndex(targetOutDir);
        let issuesFile: IssuesFile | null = null;
        if (runIndex) {
          try {
            issuesFile = await computeIssuesForCi(targetOutDir, runIndex);
          } catch {
            console.error(`   Warning: failed to compute issues`);
          }
        }

        const result = buildTargetResult(
          target.name,
          target.url,
          runId,
          targetOutDir,
          exitCode,
          runIndex,
          issuesFile,
        );
        targetResults.push(result);
        console.log(`   Status: ${result.status}`);
        console.log("");
      }

      // Generate summary + report
      const summary = buildCiSummary(targetResults);
      await writeSummary(outRoot, summary);
      await writeReport(outRoot, summary);

      console.log(`Overall: ${summary.overall.status}`);
      console.log(`Summary: ${path.join(outRoot, "summary.json")}`);
      console.log(`Report:  ${path.join(outRoot, "report.md")}`);

      // Exit based on failOn policy
      const { failOn } = config.ci;
      if (failOn === "never") {
        process.exit(0);
      } else if (failOn === "warn") {
        process.exit(summary.overall.status === "PASS" ? 0 : 1);
      } else {
        // failOn === "fail"
        process.exit(summary.overall.status === "FAIL" ? 1 : 0);
      }
    });
}
