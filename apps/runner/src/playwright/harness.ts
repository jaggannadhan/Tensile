import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import fs from "node:fs/promises";
import type { PlaywrightConfig, ArtifactRef, VideoStatus } from "@web-qa-agent/shared";
import {
  tracePath,
  videoPath,
  journeyDir,
  journeyStepsDir,
  toRelative,
} from "../artifacts/layout.js";
import { ensureDir, ensureCleanDir } from "../artifacts/writer.js";

const BROWSER_LAUNCHERS = {
  chromium,
  firefox,
  webkit,
} as const;

export interface HarnessContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  config: PlaywrightConfig;
  outDir: string;
  journeyId: string;
}

export async function createHarness(
  pwConfig: PlaywrightConfig,
  outDir: string,
  journeyId: string,
): Promise<HarnessContext> {
  const jDir = journeyDir(outDir, journeyId);
  await ensureCleanDir(jDir);

  const launcher = BROWSER_LAUNCHERS[pwConfig.browser];
  const browser = await launcher.launch({ headless: pwConfig.headless });

  const contextOptions: Record<string, unknown> = {
    viewport: { width: 1280, height: 720 },
  };

  if (pwConfig.video) {
    await ensureDir(jDir);
    contextOptions.recordVideo = {
      dir: jDir,
      size: { width: 1280, height: 720 },
    };
  }

  const context = await browser.newContext(contextOptions);

  if (pwConfig.trace) {
    await context.tracing.start({ screenshots: true, snapshots: true });
  }

  if (pwConfig.stepScreenshots) {
    await ensureDir(journeyStepsDir(outDir, journeyId));
  }

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(pwConfig.timeoutMs);
  page.setDefaultTimeout(pwConfig.timeoutMs);

  return { browser, context, page, config: pwConfig, outDir, journeyId };
}

export interface CloseHarnessResult {
  artifacts: ArtifactRef[];
  video: VideoStatus;
}

export async function closeHarness(
  harness: HarnessContext,
): Promise<CloseHarnessResult> {
  const artifacts: ArtifactRef[] = [];
  const video: VideoStatus = {
    enabled: harness.config.video,
    saved: false,
  };

  try {
    // Stop tracing
    if (harness.config.trace) {
      const tp = tracePath(harness.outDir, harness.journeyId);
      await harness.context.tracing.stop({ path: tp });
      artifacts.push({
        kind: "trace",
        path: toRelative(harness.outDir, tp),
      });
    }

    // Close page to finalize video
    await harness.page.close();

    // Move video file if recorded
    if (harness.config.video) {
      try {
        const videoHandle = harness.page.video();
        if (videoHandle) {
          const srcPath = await videoHandle.path();
          const destPath = videoPath(harness.outDir, harness.journeyId);
          try {
            await fs.rename(srcPath, destPath);
          } catch {
            await fs.copyFile(srcPath, destPath);
            await fs.unlink(srcPath).catch(() => {});
          }
          artifacts.push({
            kind: "video",
            path: toRelative(harness.outDir, destPath),
          });
          video.saved = true;
        } else {
          video.reason = "No video handle returned by Playwright";
        }
      } catch (err) {
        video.reason = (err as Error).message;
      }
    }
  } finally {
    await harness.context.close();
    await harness.browser.close();
  }

  return { artifacts, video };
}
