import type { Command } from "commander";
import { addCommonOptions } from "../config/cli.js";
import { buildRunConfig } from "../config/load.js";
import { redactConfig } from "../utils/redact.js";
import { toJson } from "../utils/json.js";

export function registerValidateCommand(program: Command): void {
  const cmd = program.command("validate").description("Validate config without creating output directory");
  addCommonOptions(cmd);

  cmd.action(async (opts) => {
    try {
      const config = await buildRunConfig(opts);
      const redacted = redactConfig(config);
      console.log("\n=== Validated RunConfig ===");
      console.log(toJson(redacted));
      console.log("\nConfig is valid.");
      process.exit(0);
    } catch (err) {
      console.error("\nValidation failed:");
      console.error((err as Error).message);
      process.exit(2);
    }
  });
}
