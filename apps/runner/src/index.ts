#!/usr/bin/env node
import { Command } from "commander";
import { registerValidateCommand } from "./commands/validate.js";
import { registerRunCommand } from "./commands/run.js";
import { registerDryrunCommand } from "./commands/dryrun.js";
import { registerArtifactsCommand } from "./commands/artifacts.js";

const program = new Command();

program
  .name("qa-agent")
  .description("Web QA Stress Agent — CLI + Config + Safety Policy Engine")
  .version("0.1.0");

registerValidateCommand(program);
registerRunCommand(program);
registerDryrunCommand(program);
registerArtifactsCommand(program);

program.parseAsync(process.argv).catch((err) => {
  console.error("Unexpected error:", (err as Error).message);
  process.exit(4);
});
