import path from "node:path";

export function runJsonPath(outDir: string): string {
  return path.join(outDir, "run.json");
}

export function configNormalizedPath(outDir: string): string {
  return path.join(outDir, "config.normalized.json");
}

export function safetyPolicyPath(outDir: string): string {
  return path.join(outDir, "safety.policy.json");
}

export function safetyEventsPath(outDir: string): string {
  return path.join(outDir, "safety.events.jsonl");
}

export function artifactsDir(outDir: string): string {
  return path.join(outDir, "artifacts");
}

export function logsDir(outDir: string): string {
  return path.join(outDir, "logs");
}

export function reportsDir(outDir: string): string {
  return path.join(outDir, "reports");
}
