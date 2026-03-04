import type { Command } from "commander";
import type { SafetyAction } from "@web-qa-agent/shared";
import { addCommonOptions } from "../config/cli.js";
import { buildRunConfig } from "../config/load.js";
import { buildPolicy, evaluate } from "../safety/policy.js";
import { DEFAULT_DENY_PATTERNS } from "../safety/denylist.js";
import { createEvent, serializeEvent } from "../safety/events.js";

const SYNTHETIC_ACTIONS: SafetyAction[] = [
  { type: "CLICK", label: "Sign in" },
  { type: "SUBMIT_FORM", label: "Create account" },
  { type: "DELETE", label: "Delete account" },
  { type: "PURCHASE", label: "Buy now" },
  { type: "NAVIGATE", label: "Go to settings" },
  { type: "FILL", label: "Enter email" },
  { type: "UPLOAD", label: "Upload avatar" },
  { type: "UPDATE_SETTINGS", label: "Save preferences" },
  // Hard-block coverage: all four patterns from the A&D
  { type: "CLICK", label: "Close account" },
  { type: "CLICK", label: "Terminate account" },
  { type: "DELETE", label: "Wipe all data" },
];

export function registerDryrunCommand(program: Command): void {
  const cmd = program.command("dryrun").description("Simulate safety checks against synthetic actions");
  addCommonOptions(cmd);

  cmd.action(async (opts) => {
    try {
      const config = await buildRunConfig(opts);
      const denylist = config.denylist.length > 0 ? config.denylist : DEFAULT_DENY_PATTERNS;
      const policy = buildPolicy(config.readOnly, denylist, config.allowlist);

      console.log("\n=== Dry Run — Safety Policy Evaluation ===");
      console.log(`Read-only: ${policy.readOnly}`);
      console.log(`Denylist:  ${policy.denylist.join(", ") || "(none)"}`);
      console.log(`Allowlist: ${policy.allowlist.join(", ") || "(none)"}`);
      console.log(`Hard-block: ${policy.hardBlockPatterns.join(", ")}`);
      console.log("\n--- Action Decisions ---\n");

      let allowed = 0;
      let blocked = 0;

      for (const action of SYNTHETIC_ACTIONS) {
        const decision = evaluate(policy, action);
        const event = createEvent(config.runId, action, decision);
        const icon = decision.allowed ? "ALLOW" : "BLOCK";
        const tag = decision.severity.toUpperCase();

        console.log(
          `[${icon}] ${action.type} "${action.label}" — ${decision.reason} (rule: ${decision.ruleId}, severity: ${tag})`,
        );

        if (!decision.allowed || decision.ruleId.includes("OVERRIDE")) {
          console.log(`       event: ${serializeEvent(event)}`);
        }

        if (decision.allowed) allowed++;
        else blocked++;
      }

      console.log(`\n--- Summary: ${allowed} allowed, ${blocked} blocked ---`);
      process.exit(0);
    } catch (err) {
      console.error("\nDry-run failed:");
      console.error((err as Error).message);
      process.exit(2);
    }
  });
}
