import fs from "node:fs/promises";
import path from "node:path";
import type { CandidateJourney } from "@web-qa-agent/shared";
import { CandidateJourneySchema } from "@web-qa-agent/shared";
import { z } from "zod";
import type { LoadedCandidates } from "./types.js";
import { journeyCandidatesPath } from "../artifacts/layout.js";

/**
 * Load candidate journeys from discovery output directory or a user-specified file.
 */
export async function loadCandidates(
  outDir: string,
  mode: "discovery" | "file",
  filePath?: string,
): Promise<LoadedCandidates> {
  const sourcePath = mode === "file" && filePath
    ? path.resolve(filePath)
    : journeyCandidatesPath(outDir);

  const raw = await fs.readFile(sourcePath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;

  const schema = z.array(CandidateJourneySchema);
  const result = schema.safeParse(parsed);

  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid candidates file at ${sourcePath}:\n${messages}`);
  }

  return {
    source: mode,
    path: sourcePath,
    candidates: result.data as CandidateJourney[],
  };
}
