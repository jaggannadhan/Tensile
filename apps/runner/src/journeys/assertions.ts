import type { Page } from "playwright";
import { SoftAssertionError } from "../playwright/steps.js";

const ERROR_TITLE_PATTERNS = [
  /\b404\b/,
  /\b500\b/,
  /\b502\b/,
  /\b503\b/,
  /not found/i,
  /server error/i,
  /internal error/i,
  /access denied/i,
  /forbidden/i,
];

/** Assert that <body> is attached to the DOM (hard fail). */
export async function assertBodyAttached(page: Page): Promise<void> {
  await page.waitForSelector("body", { state: "attached", timeout: 10_000 });
}

/**
 * Assert that the document has rendered meaningful content (soft fail).
 * Uses a 3-signal heuristic — PASS if ANY signal indicates content rendered:
 *   A) Viewport layout size (rect >= 200x200)
 *   B) At least 1 visible element with non-trivial size
 *   C) DOM density (>= 20 elements in body)
 * WARN (soft-fail) only when ALL signals fail.
 * Includes a stabilization delay before evaluating.
 */
export async function assertRenderedContent(page: Page): Promise<void> {
  // Stabilization: ensure load state complete + brief render delay
  try {
    await page.waitForLoadState("load", { timeout: 10_000 });
  } catch {
    // Timeout is OK — SPAs may never fire "load" if they stream resources
  }
  await page.waitForTimeout(600);

  const evidence = await page.evaluate(() => {
    const doc = (globalThis as any).document;
    const win = globalThis as any;
    const r = doc.documentElement.getBoundingClientRect();

    const allElements = doc.querySelectorAll("body *");
    const totalElements = allElements.length;

    let visibleCount = 0;
    const limit = Math.min(totalElements, 1500);
    for (let i = 0; i < limit; i++) {
      const el = allElements[i] as any;
      const style = win.getComputedStyle(el);
      if (style.display === "none") continue;
      if (style.visibility === "hidden") continue;
      if (style.opacity === "0") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 2 && rect.height > 2) {
        visibleCount++;
      }
    }

    return {
      rectW: Math.round(r.width),
      rectH: Math.round(r.height),
      totalElements,
      visibleCount,
    };
  });

  // Signal A: Viewport layout size
  const hasLayout = evidence.rectW >= 200 && evidence.rectH >= 200;
  // Signal B: At least 1 visible element with non-trivial size
  const hasVisible = evidence.visibleCount >= 1;
  // Signal C: DOM density (tolerant for canvas-heavy apps)
  const hasDensity = evidence.totalElements >= 20;

  // PASS if ANY signal is true
  if (hasLayout || hasVisible || hasDensity) {
    return;
  }

  throw new SoftAssertionError(
    `Rendered content check inconclusive (rect=${evidence.rectW}x${evidence.rectH}, elements=${evidence.totalElements}, visible=${evidence.visibleCount})`,
  );
}

/**
 * Assert a specific element is visible on the page (soft fail).
 * Used when the assert step has a selector (e.g. "Form is visible").
 */
export async function assertElementVisible(
  page: Page,
  selector: string,
  timeoutMs: number,
): Promise<void> {
  try {
    await page.locator(selector).waitFor({
      state: "visible",
      timeout: Math.min(timeoutMs, 5000),
    });
  } catch {
    throw new SoftAssertionError(
      `Element "${selector}" not visible — page loaded but target content not confirmed`,
    );
  }
}

/** Assert that the current URL contains the expected substring. */
export async function assertUrlContains(page: Page, expected: string): Promise<void> {
  const current = page.url();
  if (!current.includes(expected)) {
    throw new Error(`URL "${current}" does not contain "${expected}"`);
  }
}

/** Assert that the page title contains the expected substring. */
export async function assertTitleContains(page: Page, expected: string): Promise<void> {
  const title = await page.title();
  if (!title.toLowerCase().includes(expected.toLowerCase())) {
    throw new Error(`Page title "${title}" does not contain "${expected}"`);
  }
}

/**
 * Assert page is healthy: body attached and no error indicators in title.
 * Hard fail — if body is not in DOM or title matches an error pattern, step FAILs.
 */
export async function assertPageHealthy(page: Page): Promise<void> {
  await assertBodyAttached(page);

  const title = await page.title();
  for (const pattern of ERROR_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      throw new Error(`Page title "${title}" matches error pattern: ${pattern}`);
    }
  }
}
