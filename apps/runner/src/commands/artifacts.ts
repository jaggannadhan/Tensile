import type { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { runIndexPath } from "../artifacts/layout.js";
import type { RunIndex, JourneyResult } from "@web-qa-agent/shared";

export function registerArtifactsCommand(program: Command): void {
  const cmd = program
    .command("artifacts")
    .description("Inspect artifacts from a completed run");

  cmd
    .command("list")
    .description("List all artifacts from a run directory")
    .requiredOption("--out <path>", "Run output directory")
    .action(async (opts: { out: string }) => {
      const outDir = path.resolve(opts.out);

      // Read run index
      const indexPath = runIndexPath(outDir);
      let indexRaw: string;
      try {
        indexRaw = await fs.readFile(indexPath, "utf-8");
      } catch {
        console.error(`No run.index.json found at ${indexPath}`);
        process.exit(1);
      }

      const index: RunIndex = JSON.parse(indexRaw);
      console.log(`Run:       ${index.runId}`);
      console.log(`Target:    ${index.targetUrl}`);
      console.log(`Env:       ${index.envName}`);
      console.log(`Started:   ${index.startedAt}`);
      console.log(`Ended:     ${index.endedAt ?? "(in progress)"}`);
      console.log(`Journeys:  ${index.journeys.length}`);
      console.log("");

      for (const entry of index.journeys) {
        console.log(`--- Journey: ${entry.name} [${entry.status}] (${entry.durationMs}ms) ---`);

        // Read journey result
        const resultPath = path.join(outDir, entry.resultPath);
        let result: JourneyResult;
        try {
          const raw = await fs.readFile(resultPath, "utf-8");
          result = JSON.parse(raw);
        } catch {
          console.log(`  (result file not readable: ${entry.resultPath})`);
          continue;
        }

        // Print journey-level artifacts
        if (result.artifacts.length > 0) {
          console.log("  Artifacts:");
          for (const a of result.artifacts) {
            const absPath = path.join(outDir, a.path);
            const exists = await fileExists(absPath);
            const marker = exists ? "OK" : "MISSING";
            console.log(`    [${a.kind}] ${a.path}  (${marker})`);
          }
        }

        // Print step-level artifacts
        for (const step of result.steps) {
          if (step.artifacts && step.artifacts.length > 0) {
            console.log(`  Step ${step.index} (${step.name}):`);
            for (const a of step.artifacts) {
              const absPath = path.join(outDir, a.path);
              const exists = await fileExists(absPath);
              const marker = exists ? "OK" : "MISSING";
              console.log(`    [${a.kind}] ${a.path}  (${marker})`);
            }
          }
        }

        // Print video status
        if (result.video) {
          const vs = result.video;
          console.log(`  Video: enabled=${vs.enabled}, saved=${vs.saved}${vs.reason ? `, reason=${vs.reason}` : ""}`);
        }

        console.log("");
      }
    });
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
