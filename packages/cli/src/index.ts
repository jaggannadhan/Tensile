import { Command } from "commander";
import { setRunnerScriptPath, registerCiCommand } from "@web-qa-agent/runner/commands/ci";
import { registerRunCommand } from "@web-qa-agent/runner/commands/run";

// Point CI subprocess spawns at this CLI's own bundled dist
setRunnerScriptPath(__filename);

const program = new Command();

program
  .name("tensile")
  .description("Tensile — automated UI quality agent")
  .version("0.1.0");

registerRunCommand(program);
registerCiCommand(program);

program.parseAsync(process.argv).catch((err) => {
  console.error("Error:", (err as Error).message);
  process.exit(4);
});
