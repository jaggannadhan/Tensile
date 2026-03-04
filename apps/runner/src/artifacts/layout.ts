import path from "node:path";

export function journeysDir(outDir: string): string {
  return path.join(outDir, "artifacts", "journeys");
}

export function journeyDir(outDir: string, journeyId: string): string {
  return path.join(journeysDir(outDir), journeyId);
}

export function journeyStepsDir(outDir: string, journeyId: string): string {
  return path.join(journeyDir(outDir, journeyId), "steps");
}

export function tracePath(outDir: string, journeyId: string): string {
  return path.join(journeyDir(outDir, journeyId), "trace.zip");
}

export function videoPath(outDir: string, journeyId: string): string {
  return path.join(journeyDir(outDir, journeyId), "video.webm");
}

export function screenshotFailPath(outDir: string, journeyId: string): string {
  return path.join(journeyDir(outDir, journeyId), "screenshot_fail.png");
}

export function screenshotSoftFailPath(outDir: string, journeyId: string): string {
  return path.join(journeyDir(outDir, journeyId), "screenshot_soft_fail.png");
}

export function networkEventsPath(outDir: string, journeyId: string): string {
  return path.join(journeyDir(outDir, journeyId), "network.events.json");
}

export function consoleLogPath(outDir: string, journeyId: string): string {
  return path.join(journeyDir(outDir, journeyId), "console.log");
}

export function pageErrorsPath(outDir: string, journeyId: string): string {
  return path.join(journeyDir(outDir, journeyId), "pageerrors.log");
}

export function journeyResultPath(outDir: string, journeyId: string): string {
  return path.join(journeyDir(outDir, journeyId), "result.json");
}

export function runIndexPath(outDir: string): string {
  return path.join(outDir, "run.index.json");
}

export function stepScreenshotPath(
  outDir: string,
  journeyId: string,
  index: number,
): string {
  const padded = String(index).padStart(3, "0");
  return path.join(journeyStepsDir(outDir, journeyId), `${padded}.png`);
}

// --- Module 3: Discovery paths ---

export function discoveryDir(outDir: string): string {
  return path.join(outDir, "artifacts", "discovery");
}

export function siteMapPath(outDir: string): string {
  return path.join(discoveryDir(outDir), "site.map.json");
}

export function pageActionsPath(outDir: string): string {
  return path.join(discoveryDir(outDir), "page.actions.json");
}

export function journeyCandidatesPath(outDir: string): string {
  return path.join(discoveryDir(outDir), "journeys.candidates.json");
}

export function journeysExcludedPath(outDir: string): string {
  return path.join(discoveryDir(outDir), "journeys.excluded.json");
}

export function discoveryMdPath(outDir: string): string {
  return path.join(discoveryDir(outDir), "discovery.md");
}

export function discoveryScreenshotsDir(outDir: string): string {
  return path.join(discoveryDir(outDir), "screenshots", "pages");
}

export function discoveryPageScreenshotPath(outDir: string, slug: string): string {
  return path.join(discoveryScreenshotsDir(outDir), `${slug}.png`);
}

// --- Module 4: Journey execution paths ---

export function journeysExecutedPath(outDir: string): string {
  return path.join(discoveryDir(outDir), "journeys.executed.json");
}

export function plannerSelectionPath(outDir: string): string {
  return path.join(discoveryDir(outDir), "planner.selection.json");
}

/** Convert absolute path to relative (to outDir) for ArtifactRef.path */
export function toRelative(outDir: string, absPath: string): string {
  return path.relative(outDir, absPath);
}
