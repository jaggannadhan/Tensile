import type { Page } from "playwright";
import type {
  RunConfig,
  SafetyPolicy,
  PageNode,
  ActionTarget,
  DiscoveryResult,
} from "@web-qa-agent/shared";
import type { RecorderState } from "../playwright/recorder.js";
import type { CrawlState, QueueItem } from "./types.js";
import { normalizeUrl, urlToSlug } from "./normalize.js";
import { shouldCrawl } from "./filters.js";
import { extractLinks, extractActionTargets } from "./extract.js";
import { evaluate } from "../safety/policy.js";
import { writeSafetyEvent } from "../safety/events.js";
import { startTimer, stopTimer } from "../playwright/time.js";
import { writeJsonFile } from "../artifacts/writer.js";
import { ensureDir } from "../artifacts/writer.js";
import {
  siteMapPath,
  pageActionsPath,
  discoveryScreenshotsDir,
  discoveryPageScreenshotPath,
  toRelative,
} from "../artifacts/layout.js";

export interface CrawlOutput {
  pages: PageNode[];
  actions: ActionTarget[];
  result: DiscoveryResult;
}

export async function runDiscovery(
  config: RunConfig,
  policy: SafetyPolicy,
  page: Page,
  recorder: RecorderState,
): Promise<CrawlOutput> {
  const timer = startTimer();
  const allPages: PageNode[] = [];
  const allActions: ActionTarget[] = [];

  const startUrl = normalizeUrl(config.url, config.discovery.includeQueryParams);
  const { maxPages, discovery } = config;
  const { maxDepth, sameOriginOnly, includeQueryParams, actionLimitPerPage,
          discoveryTimeoutMs, discoveryMode, saveScreenshots } = discovery;

  const state: CrawlState = {
    visited: new Set<string>(),
    queue: [{ url: startUrl, depth: 0, discoveredFrom: "(start)" }],
    pagesDiscovered: 0,
    linksFound: 0,
    blockedNavigations: 0,
  };

  if (saveScreenshots) {
    await ensureDir(discoveryScreenshotsDir(config.outDir));
  }

  const deadlineMs = Date.now() + discoveryTimeoutMs;

  while (state.queue.length > 0) {
    // Wall-clock timeout
    if (Date.now() >= deadlineMs) break;

    // Max pages limit
    if (state.pagesDiscovered >= maxPages) break;

    const item = state.queue.shift()!;

    // Depth limit
    if (item.depth > maxDepth) continue;

    // Already visited
    const normalized = normalizeUrl(item.url, includeQueryParams);
    if (!normalized || state.visited.has(normalized)) continue;
    state.visited.add(normalized);

    // Safety check: evaluate NAVIGATE action
    const navAction = { type: "NAVIGATE" as const, label: normalized, url: normalized };
    const navDecision = evaluate(policy, navAction);
    await writeSafetyEvent(config.outDir, config.runId, navAction, navDecision);

    if (!navDecision.allowed) {
      state.blockedNavigations++;
      continue;
    }

    // Snapshot page errors before navigation
    const errCountBefore = recorder.pageErrors.length;

    // Navigate
    let httpStatus: number | undefined;
    let pageTitle: string | undefined;
    try {
      const response = await page.goto(normalized, {
        waitUntil: "domcontentloaded",
        timeout: config.playwright.timeoutMs,
      });
      httpStatus = response?.status();
    } catch {
      // Navigation failed — record the page with error
      const errCountAfter = recorder.pageErrors.length;
      allPages.push({
        url: normalized,
        discoveredFrom: item.discoveredFrom,
        depth: item.depth,
        firstSeenAt: new Date().toISOString(),
        httpStatus: undefined,
        errorCount: errCountAfter - errCountBefore + 1, // +1 for the nav failure itself
        actionCount: 0,
      });
      state.pagesDiscovered++;
      continue;
    }

    // Thorough mode: wait for hydration
    if (discoveryMode === "thorough") {
      try {
        await page.waitForTimeout(250);
      } catch {
        // ignore
      }
    }

    // Capture title
    try {
      pageTitle = await page.title();
    } catch {
      // ignore
    }

    // Extract links
    let links: string[] = [];
    try {
      links = await extractLinks(page);
    } catch {
      // ignore
    }

    // Normalize + filter + enqueue
    for (const rawLink of links) {
      const norm = normalizeUrl(rawLink, includeQueryParams);
      if (!norm) continue;
      state.linksFound++;

      if (state.visited.has(norm)) continue;
      if (!shouldCrawl(norm, startUrl, sameOriginOnly, config.denylist)) continue;

      state.queue.push({
        url: norm,
        depth: item.depth + 1,
        discoveredFrom: normalized,
      });
    }

    // Extract action targets
    let pageActions: ActionTarget[] = [];
    try {
      pageActions = await extractActionTargets(page, normalized, actionLimitPerPage);
    } catch {
      // ignore
    }
    allActions.push(...pageActions);

    // Optional screenshot
    if (saveScreenshots) {
      try {
        const slug = urlToSlug(normalized);
        const ssPath = discoveryPageScreenshotPath(config.outDir, slug);
        await page.screenshot({ path: ssPath });
      } catch {
        // ignore
      }
    }

    // Record page node
    const errCountAfter = recorder.pageErrors.length;
    allPages.push({
      url: normalized,
      discoveredFrom: item.discoveredFrom,
      depth: item.depth,
      firstSeenAt: new Date().toISOString(),
      title: pageTitle,
      httpStatus,
      errorCount: errCountAfter - errCountBefore,
      actionCount: pageActions.length,
    });

    state.pagesDiscovered++;
  }

  // Write output files
  const smPath = siteMapPath(config.outDir);
  await writeJsonFile(smPath, allPages);

  const paPath = pageActionsPath(config.outDir);
  await writeJsonFile(paPath, allActions);

  const timing = stopTimer(timer);

  const result: DiscoveryResult = {
    startedAt: timing.startedAt,
    endedAt: timing.endedAt,
    durationMs: timing.durationMs,
    pagesDiscovered: state.pagesDiscovered,
    pagesVisited: state.pagesDiscovered,
    maxPages,
    maxDepth,
    linksFound: state.linksFound,
    actionsFound: allActions.length,
    blockedNavigations: state.blockedNavigations,
    siteMapPath: toRelative(config.outDir, smPath),
    actionsPath: toRelative(config.outDir, paPath),
    candidatesPath: "", // filled by caller after candidate generation
    discoveryMdPath: "", // filled by caller after report generation
  };

  return { pages: allPages, actions: allActions, result };
}
