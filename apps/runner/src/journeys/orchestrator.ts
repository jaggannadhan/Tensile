import type {
  RunConfig,
  SafetyPolicy,
  JourneyResult,
  ExecutedJourneyRecord,
} from "@web-qa-agent/shared";
import { loadCandidates } from "./loader.js";
import { planJourneys } from "./planner.js";
import { executeJourney } from "./executor.js";
import { writeJourneyResult } from "../run/results.js";
import { journeysExecutedPath, journeyResultPath, plannerSelectionPath, toRelative } from "../artifacts/layout.js";
import { writeJsonFile } from "../artifacts/writer.js";

export interface JourneyOrchestrationResult {
  results: JourneyResult[];
  executed: ExecutedJourneyRecord[];
  skipped: Array<{ id: string; name: string; reason: string }>;
}

/**
 * Full journey pipeline: load candidates → plan → execute each → write results.
 */
export async function runJourneys(
  config: RunConfig,
  policy: SafetyPolicy,
): Promise<JourneyOrchestrationResult> {
  const mode = config.journey.journeysMode === "file" ? "file" : "discovery";
  const filePath = config.journey.journeysMode === "file"
    ? config.journey.journeysParam
    : undefined;

  // Load
  const loaded = await loadCandidates(config.outDir, mode, filePath);
  console.log(`  Loaded ${loaded.candidates.length} candidates from ${loaded.source} (${loaded.path})`);

  // Plan
  const plan = planJourneys(loaded.candidates, config.journey, policy);
  console.log(`  Planned ${plan.specs.length} journeys, skipped ${plan.skipped.length}`);

  for (const s of plan.skipped) {
    console.log(`    Skipped: ${s.name} — ${s.reason}`);
  }

  // Write planner selection diagnostics
  await writeJsonFile(plannerSelectionPath(config.outDir), plan.selection);

  // Execute each journey sequentially
  const results: JourneyResult[] = [];
  const executed: ExecutedJourneyRecord[] = [];

  for (const spec of plan.specs) {
    const blocked = spec.safetyPreCheck === "BLOCKED";
    const icon = blocked ? "BLOCKED" : "RUN";
    console.log(`\n  [${icon}] ${spec.name} (${spec.priority}, ${spec.steps.length} steps)`);

    const result = await executeJourney(spec, config, policy);
    results.push(result);

    // Write per-journey result
    await writeJourneyResult(config.outDir, result);

    const resultPath = toRelative(
      config.outDir,
      journeyResultPath(config.outDir, result.journeyId),
    );
    executed.push({ spec, resultPath });

    const statusIcon = result.status === "PASS" ? "PASS" : "FAIL";
    console.log(`    ${statusIcon} in ${result.durationMs}ms`);

    for (const step of result.steps) {
      const stepIcon =
        step.status === "PASS" ? "OK" :
        step.status === "SOFT_FAIL" ? "WARN" :
        step.status === "SKIP" ? "SKIP" : "FAIL";
      console.log(`      [${stepIcon}] ${step.name} (${step.durationMs}ms)`);
      if (step.error) {
        console.log(`             ${step.error.message}`);
      }
    }
  }

  // Write journeys.executed.json
  const executedPath = journeysExecutedPath(config.outDir);
  await writeJsonFile(executedPath, executed);

  return { results, executed, skipped: plan.skipped };
}
