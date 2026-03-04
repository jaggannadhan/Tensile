import type { Page } from "playwright";
import type { RecorderState } from "../playwright/recorder.js";
import type { ObservableChangeResult } from "./types.js";

/** Snapshot of page state at a point in time. */
export interface PageSnapshot {
  url: string;
  domHash: number;
  networkCount: number;
}

/** Take a snapshot of the current page state. */
export async function takeSnapshot(page: Page, recorder: RecorderState): Promise<PageSnapshot> {
  const url = page.url();
  const networkCount = recorder.networkEvents.length;

  // DOM fingerprint: body text length + innerHTML length via page.evaluate
  const domHash = await page.evaluate(() => {
    const body = (globalThis as any).document.body;
    if (!body) return 0;
    const textLen = (body.innerText || "").length;
    const htmlLen = (body.innerHTML || "").length;
    return textLen * 31 + htmlLen;
  });

  return { url, domHash, networkCount };
}

/** Detect whether an observable change occurred between two snapshots. */
export function detectChange(before: PageSnapshot, after: PageSnapshot): ObservableChangeResult {
  const urlChanged = before.url !== after.url;
  const domChanged = before.domHash !== after.domHash;
  const networkActivity = after.networkCount > before.networkCount;
  const changed = urlChanged || domChanged || networkActivity;

  const parts: string[] = [];
  if (urlChanged) parts.push(`URL changed: "${before.url}" → "${after.url}"`);
  if (domChanged) parts.push(`DOM changed (hash ${before.domHash} → ${after.domHash})`);
  if (networkActivity) parts.push(`Network activity (+${after.networkCount - before.networkCount} events)`);
  if (!changed) parts.push("No observable change detected");

  return {
    changed,
    urlChanged,
    domChanged,
    networkActivity,
    details: parts.join("; "),
  };
}
