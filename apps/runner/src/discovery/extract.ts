import type { Page } from "playwright";
import type { ActionTarget, ActionTargetType } from "@web-qa-agent/shared";
import { matchesAnyPattern } from "../safety/denylist.js";
import { DEFAULT_DENY_PATTERNS } from "../safety/denylist.js";

/** Raw element data returned from page.evaluate() — must be JSON-serializable. */
interface RawElement {
  tagName: string;
  role: string | null;
  inputType: string | null;
  isVisible: boolean;
  isDisabled: boolean;
  textContent: string;
  ariaLabel: string | null;
  href: string | null;
  id: string | null;
  dataTestId: string | null;
  placeholder: string | null;
}

/** Extract all internal links from the current page. */
export async function extractLinks(page: Page): Promise<string[]> {
  try {
    // The callback runs in the browser; DOM globals are available at runtime
    // but not in the Node tsconfig, so we use explicit `any` casts.
    return await page.evaluate(() => {
      const doc = (globalThis as any).document;
      const anchors = doc.querySelectorAll("a[href]") as any[];
      const urls: string[] = [];
      for (const el of anchors) {
        const href: string | undefined = el.href;
        if (
          href &&
          !href.startsWith("javascript:") &&
          !href.startsWith("mailto:") &&
          !href.startsWith("tel:")
        ) {
          urls.push(href);
        }
      }
      return urls;
    });
  } catch {
    return [];
  }
}

/** Extract actionable elements from the current page. */
export async function extractActionTargets(
  page: Page,
  pageUrl: string,
  limit: number,
): Promise<ActionTarget[]> {
  let rawElements: RawElement[];
  try {
    // The callback runs in the browser; DOM globals are available at runtime
    // but not in the Node tsconfig, so we cast through `any`.
    rawElements = await page.evaluate((lim: number) => {
      const doc = (globalThis as any).document;
      const win = globalThis as any;
      const SELECTOR =
        "a[href], button, input, select, textarea, [role='button'], [role='link'], form";
      const nodes = doc.querySelectorAll(SELECTOR) as any[];
      const results: any[] = [];

      for (const el of nodes) {
        if (results.length >= lim) break;
        const htmlEl = el as any;

        // Determine visibility
        let isVisible = false;
        try {
          const style = win.getComputedStyle(htmlEl);
          isVisible =
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            htmlEl.offsetWidth > 0 &&
            htmlEl.offsetHeight > 0;
        } catch {
          // skip
        }

        const tagName: string = htmlEl.tagName.toLowerCase();
        const role: string | null = htmlEl.getAttribute("role");
        const inputType: string | null =
          tagName === "input"
            ? htmlEl.type?.toLowerCase() ?? null
            : tagName === "button"
              ? htmlEl.type?.toLowerCase() ?? null
              : null;

        const text: string = (htmlEl.textContent ?? "").trim().slice(0, 100);
        const ariaLabel: string | null = htmlEl.getAttribute("aria-label");
        const href: string | null = htmlEl.href || null;
        const id: string | null = htmlEl.id || null;
        const dataTestId: string | null =
          htmlEl.getAttribute("data-testid") ??
          htmlEl.getAttribute("data-test") ??
          htmlEl.getAttribute("data-cy") ??
          null;
        const placeholder: string | null = htmlEl.placeholder || null;

        results.push({
          tagName,
          role,
          inputType,
          isVisible,
          isDisabled: htmlEl.disabled ?? false,
          textContent: text,
          ariaLabel,
          href,
          id,
          dataTestId,
          placeholder,
        });
      }

      return results;
    }, limit);
  } catch {
    return [];
  }

  return rawElements.map((raw) => toActionTarget(raw, pageUrl));
}

function inferActionType(raw: RawElement): ActionTargetType {
  const tag = raw.tagName;
  if (tag === "a") return "NAVIGATE";
  if (tag === "select") return "SELECT";
  if (tag === "textarea") return "FILL";
  if (tag === "form") return "SUBMIT_FORM";
  if (tag === "input") {
    if (raw.inputType === "submit") return "SUBMIT_FORM";
    if (raw.inputType === "button") return "CLICK";
    return "FILL";
  }
  if (tag === "button") return "CLICK";
  if (raw.role === "button") return "CLICK";
  if (raw.role === "link") return "NAVIGATE";
  return "CLICK";
}

function buildSelector(raw: RawElement): { best: string; candidates: string[] } {
  const candidates: string[] = [];

  if (raw.dataTestId) {
    candidates.push(`[data-testid="${raw.dataTestId}"]`);
  }
  if (raw.id) {
    candidates.push(`#${raw.id}`);
  }
  if (raw.ariaLabel) {
    candidates.push(`[aria-label="${raw.ariaLabel}"]`);
  }
  if (raw.textContent && raw.textContent.length > 0 && raw.textContent.length <= 50) {
    if (raw.tagName === "a") {
      candidates.push(`a:has-text("${raw.textContent}")`);
    } else if (raw.tagName === "button" || raw.role === "button") {
      candidates.push(`button:has-text("${raw.textContent}")`);
    }
  }
  // CSS fallback
  const cssParts = [raw.tagName];
  if (raw.role) cssParts.push(`[role="${raw.role}"]`);
  if (raw.inputType) cssParts.push(`[type="${raw.inputType}"]`);
  candidates.push(cssParts.join(""));

  return { best: candidates[0] ?? raw.tagName, candidates };
}

function buildHumanLabel(raw: RawElement): string {
  return (
    raw.ariaLabel ??
    raw.textContent ??
    raw.placeholder ??
    raw.id ??
    raw.tagName
  );
}

function computeConfidence(raw: RawElement): number {
  if (raw.dataTestId) return 0.9;
  if (raw.id) return 0.8;
  if (raw.ariaLabel) return 0.7;
  if (raw.textContent && raw.textContent.length > 0) return 0.6;
  return 0.5;
}

const AUTH_PATTERN = /sign.?in|log.?in|login|register|sign.?up|create.?account/i;

function toActionTarget(raw: RawElement, pageUrl: string): ActionTarget {
  const label = buildHumanLabel(raw);
  const { best, candidates } = buildSelector(raw);
  const looksDestructive = matchesAnyPattern(label, DEFAULT_DENY_PATTERNS) !== null;
  const requiresAuth = AUTH_PATTERN.test(label);

  return {
    pageUrl,
    actionType: inferActionType(raw),
    selector: best,
    selectorCandidates: candidates,
    humanLabel: label,
    element: {
      tagName: raw.tagName,
      role: raw.role ?? undefined,
      inputType: raw.inputType ?? undefined,
      href: raw.href ?? undefined,
      isVisible: raw.isVisible,
      isDisabled: raw.isDisabled,
    },
    riskFlags: {
      looksDestructive,
      requiresAuth,
    },
    confidence: computeConfidence(raw),
  };
}
