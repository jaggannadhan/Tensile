import fs from "node:fs/promises";
import type { RunConfig, SafetyPolicy } from "@web-qa-agent/shared";
import {
  runJsonPath,
  configNormalizedPath,
  safetyPolicyPath,
} from "./paths.js";
import { toJson } from "../utils/json.js";
import { redactConfig } from "../utils/redact.js";

export async function writeRunMetadata(config: RunConfig): Promise<void> {
  const skeleton = {
    runId: config.runId,
    startedAt: config.startedAt,
    url: config.url,
    env: config.env,
    status: "initialized",
    completedAt: null,
  };
  await fs.writeFile(runJsonPath(config.outDir), toJson(skeleton), "utf-8");
}

export async function writeNormalizedConfig(config: RunConfig): Promise<void> {
  const redacted = redactConfig(config);
  await fs.writeFile(
    configNormalizedPath(config.outDir),
    toJson(redacted),
    "utf-8",
  );
}

export async function writeSafetyPolicy(
  outDir: string,
  policy: SafetyPolicy,
): Promise<void> {
  await fs.writeFile(safetyPolicyPath(outDir), toJson(policy), "utf-8");
}
