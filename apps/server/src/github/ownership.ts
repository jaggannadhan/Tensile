import fs from "node:fs/promises";
import path from "node:path";
import type { RepoMeta, OwnershipHint, OwnershipHintsFile } from "./types.js";

interface JourneyResult {
  journeyId: string;
  name: string;
  status: string;
  steps: Array<{
    name: string;
    status: string;
    error?: { message: string };
    failureKind?: string;
  }>;
  artifacts: Array<{ kind: string; path: string }>;
  summary?: { url: string; httpStatus?: number };
}

interface NetworkEvent {
  type: string;
  url?: string;
  method?: string;
  status?: number;
  resourceType?: string;
}

/**
 * Compute ownership hints by correlating failed journey results with repo metadata.
 * Best-effort: catches errors per journey, writes partial results.
 */
export async function computeOwnershipHints(
  repos: RepoMeta[],
  journeyResults: JourneyResult[],
  outDir: string,
): Promise<OwnershipHintsFile | null> {
  const failedJourneys = journeyResults.filter((j) => j.status === "FAIL");
  if (failedJourneys.length === 0) return null;

  const UI_ROLES = ["frontend", "shared"];
  const SERVER_ROLES = ["backend", "api"];
  const frontendRepo = repos.find((r) => UI_ROLES.includes(r.role)) ?? repos[0];
  const backendRepo = repos.find((r) => SERVER_ROLES.includes(r.role));
  const hints: OwnershipHint[] = [];

  for (const journey of failedJourneys) {
    try {
      const hint = await classifyFailure(journey, outDir, frontendRepo, backendRepo);
      hints.push(hint);
    } catch (err) {
      console.warn(
        `[github/ownership] Error classifying journey ${journey.journeyId}:`,
        (err as Error).message,
      );
    }
  }

  if (hints.length === 0) return null;

  const file: OwnershipHintsFile = {
    hints,
    computedAt: new Date().toISOString(),
  };

  await fs.writeFile(
    path.join(outDir, "ownership.hints.json"),
    JSON.stringify(file, null, 2),
    "utf-8",
  );

  return file;
}

async function classifyFailure(
  journey: JourneyResult,
  outDir: string,
  frontendRepo: RepoMeta | undefined,
  backendRepo: RepoMeta | undefined,
): Promise<OwnershipHint> {
  const failedStep = journey.steps.find((s) => s.status === "FAIL");
  const failureKind = failedStep?.failureKind;

  // Load network events if available
  const networkArtifact = journey.artifacts.find((a) => a.kind === "network_events");
  let networkEvents: NetworkEvent[] = [];
  if (networkArtifact) {
    networkEvents = await loadNetworkEvents(outDir, networkArtifact.path);
  }

  // Find failed API requests (4xx/5xx)
  const failedApiRequests = networkEvents.filter(
    (e) =>
      e.status !== undefined &&
      e.status >= 400 &&
      e.url &&
      isApiUrl(e.url),
  );

  // Rule 1: Selector/navigation error with no failed API calls → frontend
  if (
    (failureKind === "SELECTOR_NOT_FOUND" || failureKind === "NAVIGATION_ERROR") &&
    failedApiRequests.length === 0
  ) {
    return {
      journeyId: journey.journeyId,
      journeyName: journey.name,
      likelyRepo: frontendRepo ? frontendRepo.role : "unknown",
      reason: `${failureKind} with no failed backend API calls — likely a frontend rendering or DOM issue`,
      relatedFiles: findRelatedFiles(journey, frontendRepo),
      confidence: frontendRepo ? "high" : "low",
    };
  }

  // Rule 2: Failed API requests → backend
  if (failedApiRequests.length > 0) {
    const firstFailed = failedApiRequests[0];
    return {
      journeyId: journey.journeyId,
      journeyName: journey.name,
      failedUrl: firstFailed.url,
      httpMethod: firstFailed.method,
      httpStatus: firstFailed.status,
      likelyRepo: backendRepo ? backendRepo.role : "unknown",
      reason: `API request failed with HTTP ${firstFailed.status} — likely a backend issue`,
      relatedFiles: matchUrlToRouteFiles(firstFailed.url!, backendRepo),
      confidence: backendRepo ? "high" : "medium",
    };
  }

  // Rule 3: Timeout with pending/failed network → backend
  if (failureKind === "TIMEOUT" && networkEvents.some((e) => e.type === "requestfailed")) {
    const failedReq = networkEvents.find((e) => e.type === "requestfailed");
    return {
      journeyId: journey.journeyId,
      journeyName: journey.name,
      failedUrl: failedReq?.url,
      likelyRepo: backendRepo ? backendRepo.role : "unknown",
      reason: "Step timed out with failed network requests — possible backend unresponsiveness",
      relatedFiles: failedReq?.url ? matchUrlToRouteFiles(failedReq.url, backendRepo) : [],
      confidence: "medium",
    };
  }

  // Rule 4: Assertion/other failure — try to match page URL to frontend routes
  if (frontendRepo && journey.summary?.url) {
    const pageRelated = findRelatedFiles(journey, frontendRepo);
    if (pageRelated.length > 0) {
      return {
        journeyId: journey.journeyId,
        journeyName: journey.name,
        failedUrl: journey.summary.url,
        httpStatus: journey.summary.httpStatus,
        likelyRepo: frontendRepo!.role,
        reason: "Failure occurred on a page matching frontend route patterns",
        relatedFiles: pageRelated,
        confidence: "medium",
      };
    }
  }

  // Rule 5: Fallback
  return {
    journeyId: journey.journeyId,
    journeyName: journey.name,
    failedUrl: journey.summary?.url,
    likelyRepo: "unknown",
    reason: "Unable to determine ownership — insufficient signals",
    relatedFiles: [],
    confidence: "low",
  };
}

async function loadNetworkEvents(
  outDir: string,
  eventsPath: string,
): Promise<NetworkEvent[]> {
  try {
    const raw = await fs.readFile(path.join(outDir, eventsPath), "utf-8");
    return JSON.parse(raw) as NetworkEvent[];
  } catch {
    return [];
  }
}

function isApiUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    if (p.includes("/api/") || p.includes("/graphql")) return true;
    // Not a static asset
    const assetExts = [".js", ".css", ".png", ".jpg", ".gif", ".svg", ".woff", ".woff2", ".ico"];
    return !assetExts.some((ext) => p.endsWith(ext));
  } catch {
    return false;
  }
}

function matchUrlToRouteFiles(
  requestUrl: string,
  repo: RepoMeta | undefined,
): string[] {
  if (!repo) return [];
  try {
    const u = new URL(requestUrl);
    const segments = u.pathname
      .split("/")
      .filter((s) => s.length > 0 && !s.match(/^\d+$/));

    if (segments.length === 0) return [];

    const routeFiles = repo.keyFiles
      .filter((f) => f.kind === "route_definition")
      .map((f) => f.path);

    const scored = routeFiles
      .map((filePath) => {
        let score = 0;
        const lowerPath = filePath.toLowerCase();
        for (const seg of segments) {
          if (lowerPath.includes(seg.toLowerCase())) score++;
        }
        return { path: filePath, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return scored.map((s) => s.path);
  } catch {
    return [];
  }
}

function findRelatedFiles(
  journey: JourneyResult,
  repo: RepoMeta | undefined,
): string[] {
  if (!repo || !journey.summary?.url) return [];
  try {
    const u = new URL(journey.summary.url);
    const segments = u.pathname
      .split("/")
      .filter((s) => s.length > 0 && s !== "index.html");

    if (segments.length === 0) return [];

    const allFiles = repo.keyFiles.map((f) => f.path);
    return allFiles
      .filter((fp) => {
        const lower = fp.toLowerCase();
        return segments.some((seg) => lower.includes(seg.toLowerCase()));
      })
      .slice(0, 5);
  } catch {
    return [];
  }
}
