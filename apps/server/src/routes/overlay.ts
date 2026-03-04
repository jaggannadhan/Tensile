import { Router, type Request, type Response } from "express";
import { chromium, type Browser } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { registry } from "../registry.js";

export const overlayRouter = Router({ mergeParams: true });

const MAX_SELECTORS = 30;
const CAPTURE_TIMEOUT_MS = 30_000;
const VIEWPORT = { width: 1280, height: 720 };

/** Simple lock — only one capture at a time. */
let captureRunning = false;

interface SelectorInput {
  id: string;
  selector: string;
  strategy: string;
}

interface CaptureResult {
  id: string;
  bbox: { x: number; y: number; width: number; height: number } | null;
  found: boolean;
}

/**
 * Resolve a selector string based on strategy to a Playwright locator-compatible string.
 * Strategies: "data-testid", "id", "aria", "role", "text", "css"
 */
function toPlaywrightSelector(selector: string, strategy: string): string {
  switch (strategy) {
    case "data-testid":
      // Already in [data-testid="..."] form typically
      return selector;
    case "id":
      // Already in #foo form typically
      return selector;
    case "aria":
      // [aria-label="..."] form
      return selector;
    case "role":
      return selector;
    case "text":
      return selector;
    case "css":
    default:
      return selector;
  }
}

// POST /api/runs/:id/overlay/capture
overlayRouter.post("/capture", async (req: Request, res: Response) => {
  const runId = req.params.id as string;
  const run = registry.get(runId);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  if (captureRunning) {
    res.status(429).json({ error: "Overlay capture already in progress. Try again shortly." });
    return;
  }

  const { pageUrl, selectors } = req.body as {
    pageUrl?: string;
    selectors?: SelectorInput[];
  };

  if (!pageUrl || typeof pageUrl !== "string") {
    res.status(400).json({ error: "pageUrl is required" });
    return;
  }
  if (!selectors || !Array.isArray(selectors) || selectors.length === 0) {
    res.status(400).json({ error: "selectors array is required and must be non-empty" });
    return;
  }
  if (selectors.length > MAX_SELECTORS) {
    res.status(400).json({ error: `Maximum ${MAX_SELECTORS} selectors allowed` });
    return;
  }

  captureRunning = true;
  let browser: Browser | null = null;

  try {
    const overlayId = uuidv4();
    const overlayDir = path.join(run.outDir, "artifacts", "overlays", overlayId);
    await fs.mkdir(overlayDir, { recursive: true });

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();

    // Navigate with timeout
    await page.goto(pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: CAPTURE_TIMEOUT_MS,
    });
    // Brief stabilization wait
    await page.waitForTimeout(600);

    // Resolve bounding boxes for each selector
    const items: CaptureResult[] = [];
    for (const sel of selectors) {
      const pwSelector = toPlaywrightSelector(sel.selector, sel.strategy);
      try {
        const locator = page.locator(pwSelector).first();
        const box = await locator.boundingBox({ timeout: 3000 });
        items.push({
          id: sel.id,
          bbox: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null,
          found: box !== null,
        });
      } catch {
        items.push({ id: sel.id, bbox: null, found: false });
      }
    }

    // Take screenshot
    const screenshotFile = "page.png";
    await page.screenshot({ path: path.join(overlayDir, screenshotFile) });

    // Write metadata
    const metadata = {
      overlayId,
      pageUrl,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      capturedAt: new Date().toISOString(),
      items,
    };
    await fs.writeFile(
      path.join(overlayDir, "overlay.json"),
      JSON.stringify(metadata, null, 2),
    );

    await browser.close();
    browser = null;

    // Build relative screenshot path for artifact serving
    const screenshotPath = path.join("artifacts", "overlays", overlayId, screenshotFile);

    res.json({
      screenshotPath,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      items,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    captureRunning = false;
  }
});
