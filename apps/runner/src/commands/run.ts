import type { Command } from "commander";
import type { RunIndex } from "@web-qa-agent/shared";
import { addCommonOptions } from "../config/cli.js";
import { buildRunConfig } from "../config/load.js";
import { buildPolicy } from "../safety/policy.js";
import { DEFAULT_DENY_PATTERNS } from "../safety/denylist.js";
import { initRunDirectory } from "../run/init.js";
import {
  writeRunMetadata,
  writeNormalizedConfig,
  writeSafetyPolicy,
} from "../run/write.js";
import { writeJourneyResult, writeRunIndex } from "../run/results.js";
import { runSmokeJourney } from "../playwright/smoke.js";
import { createHarness, closeHarness } from "../playwright/harness.js";
import { attachRecorder } from "../playwright/recorder.js";
import { runDiscovery } from "../discovery/crawler.js";
import { generateCandidates } from "../discovery/candidates.js";
import { generateDiscoveryMarkdown } from "../reporting/discovery_md.js";
import { runJourneys } from "../journeys/orchestrator.js";
import {
  journeyCandidatesPath,
  journeysExcludedPath,
  discoveryMdPath as discoveryMdPathFn,
  toRelative,
} from "../artifacts/layout.js";
import { writeJsonFile, writeTextFile } from "../artifacts/writer.js";
import { redactConfig } from "../utils/redact.js";
import { toJson } from "../utils/json.js";
import { ConfigError } from "../utils/errors.js";

export function registerRunCommand(program: Command): void {
  const cmd = program
    .command("run")
    .description(
      "Create run output directory, write config files, and optionally execute smoke journey",
    );
  addCommonOptions(cmd);

  cmd.action(async (opts) => {
    try {
      const config = await buildRunConfig(opts);
      const denylist =
        config.denylist.length > 0 ? config.denylist : DEFAULT_DENY_PATTERNS;
      const policy = buildPolicy(config.readOnly, denylist, config.allowlist);

      // Create directory structure
      await initRunDirectory(config.outDir);

      // Write Module 1 files
      await writeRunMetadata(config);
      await writeNormalizedConfig(config);
      await writeSafetyPolicy(config.outDir, policy);

      console.log("\n=== Run Initialized ===");
      console.log(`Run ID:    ${config.runId}`);
      console.log(`URL:       ${config.url}`);
      console.log(`Env:       ${config.env}`);
      console.log(`Output:    ${config.outDir}`);
      console.log(`Read-only: ${config.readOnly}`);
      console.log(`Smoke:     ${config.playwright.smoke}`);
      console.log(`Discover:  ${config.discovery.discover}`);
      console.log(`Journeys:  ${config.journey.journeys}`);

      const journeysEnabled = config.journey.journeys !== "none";
      const hasWork = config.playwright.smoke || config.discovery.discover || journeysEnabled;

      if (!hasWork) {
        console.log("\nFiles written:");
        console.log("  - run.json");
        console.log("  - config.normalized.json");
        console.log("  - safety.policy.json");
        console.log("\n=== Redacted Config ===");
        console.log(toJson(redactConfig(config)));
        console.log(
          "\nNothing to execute. Pass --smoke true and/or --discover true.",
        );
        process.exit(0);
      }

      let smokeFailed = false;
      const journeyResults: import("@web-qa-agent/shared").JourneyResult[] = [];
      let discoveryIndex: RunIndex["discovery"] | undefined;

      // --- Smoke journey ---
      if (config.playwright.smoke) {
        console.log(`\nBrowser:   ${config.playwright.browser}`);
        console.log(`Headless:  ${config.playwright.headless}`);
        console.log(`Trace:     ${config.playwright.trace}`);
        console.log(`Video:     ${config.playwright.video}`);
        console.log(`Timeout:   ${config.playwright.timeoutMs}ms`);
        console.log("\nRunning smoke journey...\n");

        const journeyResult = await runSmokeJourney(config, policy);
        journeyResults.push(journeyResult);
        await writeJourneyResult(config.outDir, journeyResult);

        const status = journeyResult.status;
        const icon = status === "PASS" ? "PASS" : "FAIL";
        console.log(`=== Smoke Journey: ${icon} ===`);
        console.log(`Duration:  ${journeyResult.durationMs}ms`);

        if (journeyResult.summary) {
          console.log(`Title:     ${journeyResult.summary.title ?? "(none)"}`);
          console.log(
            `HTTP:      ${journeyResult.summary.httpStatus ?? "(unknown)"}`,
          );
        }

        console.log("\nSteps:");
        for (const step of journeyResult.steps) {
          const stepIcon =
            step.status === "PASS" ? "OK" :
            step.status === "SOFT_FAIL" ? "WARN" :
            step.status === "SKIP" ? "SKIP" : "FAIL";
          console.log(`  [${stepIcon}] ${step.name} (${step.durationMs}ms)`);
          if (step.error) {
            console.log(`       Error: ${step.error.message}`);
          }
        }

        if (journeyResult.warnings && journeyResult.warnings.length > 0) {
          console.log("\nWarnings:");
          for (const w of journeyResult.warnings) {
            console.log(`  - ${w}`);
          }
        }

        console.log("\nArtifacts:");
        for (const a of journeyResult.artifacts) {
          console.log(`  [${a.kind}] ${a.path}`);
        }

        const traceRef = journeyResult.artifacts.find(
          (a) => a.kind === "trace",
        );
        if (traceRef) {
          console.log(
            `\nView trace: npx playwright show-trace ${config.outDir}/${traceRef.path}`,
          );
        }

        if (status === "FAIL") smokeFailed = true;
      }

      // --- Discovery phase ---
      if (config.discovery.discover) {
        console.log("\n=== Discovery ===");
        console.log(`Max pages:  ${config.maxPages}`);
        console.log(`Max depth:  ${config.discovery.maxDepth}`);
        console.log(`Mode:       ${config.discovery.discoveryMode}`);
        console.log(`Timeout:    ${config.discovery.discoveryTimeoutMs}ms`);
        console.log("\nRunning discovery crawl...\n");

        // Dedicated harness for discovery: no trace, no video
        const discoveryPwConfig = {
          ...config.playwright,
          trace: false,
          video: false,
          stepScreenshots: false,
        };
        const harness = await createHarness(
          discoveryPwConfig,
          config.outDir,
          "discovery",
        );
        const recorder = attachRecorder(harness.page);

        try {
          const crawlOutput = await runDiscovery(
            config,
            policy,
            harness.page,
            recorder,
          );

          // Generate candidate journeys
          const { candidates, excluded, diagnostics: candidateDiagnostics } = generateCandidates(
            crawlOutput.pages,
            crawlOutput.actions,
            config.url,
          );

          // Write candidates JSON
          const candPath = journeyCandidatesPath(config.outDir);
          await writeJsonFile(candPath, candidates);
          crawlOutput.result.candidatesPath = toRelative(config.outDir, candPath);

          // Write excluded candidates JSON
          if (excluded.length > 0) {
            const exclPath = journeysExcludedPath(config.outDir);
            await writeJsonFile(exclPath, excluded);
          }

          // Generate and write markdown report
          const mdPath = discoveryMdPathFn(config.outDir);
          crawlOutput.result.discoveryMdPath = toRelative(config.outDir, mdPath);
          const markdown = generateDiscoveryMarkdown(
            crawlOutput.result,
            crawlOutput.pages,
            crawlOutput.actions,
            candidates,
            candidateDiagnostics,
            excluded,
          );
          await writeTextFile(mdPath, markdown);

          // Set discovery index for run.index.json
          discoveryIndex = {
            siteMapPath: crawlOutput.result.siteMapPath,
            actionsPath: crawlOutput.result.actionsPath,
            candidatesPath: crawlOutput.result.candidatesPath,
            discoveryMdPath: crawlOutput.result.discoveryMdPath,
          };

          // Print summary
          console.log(`=== Discovery Complete ===`);
          console.log(`Pages visited:       ${crawlOutput.result.pagesVisited}`);
          console.log(`Links found:         ${crawlOutput.result.linksFound}`);
          console.log(`Actions found:       ${crawlOutput.result.actionsFound}`);
          console.log(`Blocked navigations: ${crawlOutput.result.blockedNavigations}`);
          console.log(`Duration:            ${crawlOutput.result.durationMs}ms`);
          console.log(`Candidates:          ${candidates.length}`);
          console.log(`Excluded:            ${excluded.length}`);
          console.log(`\nDiscovery report: ${mdPath}`);
        } finally {
          await closeHarness(harness);
        }
      }

      // --- Journey execution phase ---
      let journeysFailed = false;
      const canRunJourneys = journeysEnabled
        && (config.discovery.discover || config.journey.journeysMode === "file");
      if (canRunJourneys) {
        console.log("\n=== Journey Execution ===");
        console.log(`Mode:      ${config.journey.journeysMode}`);
        console.log(`Param:     ${config.journey.journeysParam}`);
        console.log(`Timeout:   ${config.journey.journeyTimeoutMs}ms/journey`);
        console.log(`Max steps: ${config.journey.maxStepsPerJourney}`);

        try {
          const orchResult = await runJourneys(config, policy);
          journeyResults.push(...orchResult.results);

          const passed = orchResult.results.filter((r) => r.status === "PASS").length;
          const warned = orchResult.results.filter((r) => r.status === "PASS" && r.warnings && r.warnings.length > 0).length;
          const failed = orchResult.results.filter((r) => r.status === "FAIL").length;
          console.log(`\n=== Journey Results ===`);
          console.log(`  Executed: ${orchResult.results.length}`);
          console.log(`  Passed:   ${passed}${warned > 0 ? ` (${warned} with warnings)` : ""}`);
          console.log(`  Failed:   ${failed}`);
          console.log(`  Skipped:  ${orchResult.skipped.length}`);

          if (failed > 0) journeysFailed = true;
        } catch (err) {
          console.error(`\nJourney execution error: ${(err as Error).message}`);
          journeysFailed = true;
        }
      } else if (journeysEnabled && !canRunJourneys) {
        console.log("\nWarning: --journeys requires --discover true (or --journeys file:<path>).");
        console.log("Skipping journey execution.");
      }

      // Write run index
      await writeRunIndex(config, journeyResults, discoveryIndex);

      console.log("\nFiles written:");
      console.log("  - run.json, config.normalized.json, safety.policy.json");
      console.log("  - run.index.json");
      if (journeyResults.length > 0) {
        const ids = journeyResults.map((r) => r.journeyId).join(", ");
        console.log(`  - Journey results: ${ids}`);
      }
      if (discoveryIndex) {
        console.log("  - artifacts/discovery/site.map.json");
        console.log("  - artifacts/discovery/page.actions.json");
        console.log("  - artifacts/discovery/journeys.candidates.json");
        console.log("  - artifacts/discovery/journeys.excluded.json");
        console.log("  - artifacts/discovery/discovery.md");
      }

      if (smokeFailed || journeysFailed) {
        process.exit(1);
      }
      process.exit(0);
    } catch (err) {
      if (err instanceof ConfigError) {
        console.error("\nConfig error:", err.message);
        process.exit(2);
      }
      console.error("\nError:", (err as Error).message);
      process.exit(3);
    }
  });
}
