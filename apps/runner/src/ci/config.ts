import fs from "node:fs/promises";
import { z } from "zod";

const CiTargetOptionsSchema = z.object({
  smoke: z.boolean().optional(),
  discover: z.boolean().optional(),
  journeys: z.string().optional(),
  headless: z.boolean().optional(),
  maxPages: z.number().int().positive().optional(),
  maxDepth: z.number().int().positive().optional(),
  readOnly: z.boolean().optional(),
});

const CiTargetSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  options: CiTargetOptionsSchema.optional().default({}),
});

const CiSettingsSchema = z.object({
  failOn: z.enum(["fail", "warn", "never"]).optional().default("fail"),
  artifactRetentionDays: z.number().int().positive().optional().default(7),
});

const TensileConfigSchema = z.object({
  targets: z.array(CiTargetSchema).min(1),
  ci: CiSettingsSchema.optional().default({}),
});

export type CiTargetOptions = z.infer<typeof CiTargetOptionsSchema>;
export type CiTarget = z.infer<typeof CiTargetSchema>;
export type CiSettings = z.infer<typeof CiSettingsSchema>;
export type TensileConfig = z.infer<typeof TensileConfigSchema>;

export async function loadCiConfig(configPath: string): Promise<TensileConfig> {
  const raw = await fs.readFile(configPath, "utf-8");
  const parsed = JSON.parse(raw);
  return TensileConfigSchema.parse(parsed);
}
