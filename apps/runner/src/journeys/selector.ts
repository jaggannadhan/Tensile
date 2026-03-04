import type { SelectorSpec, SelectorStrategy } from "@web-qa-agent/shared";

/** Detect the selector strategy from a selector string. */
function detectStrategy(selector: string): SelectorStrategy {
  if (selector.startsWith("http://") || selector.startsWith("https://")) return "url";
  if (selector.startsWith("[data-testid=") || selector.startsWith("[data-test=") || selector.startsWith("[data-cy=")) return "data-testid";
  if (selector.startsWith("#")) return "id";
  if (selector.startsWith("[aria-label=")) return "aria";
  if (selector.includes(":has-text(")) return "text";
  if (selector.startsWith("[role=")) return "role";
  return "css";
}

/**
 * Resolve a CandidateStep target into a SelectorSpec.
 * For "goto" steps where target is a URL, strategy is "url".
 * For interaction steps, detect the strategy from the selector string.
 */
export function resolveSelector(
  target: string | undefined,
  selectorCandidates?: string[],
): SelectorSpec | undefined {
  if (!target) return undefined;

  const strategy = detectStrategy(target);
  const fallbacks = selectorCandidates
    ? selectorCandidates.filter((c) => c !== target)
    : [];

  return {
    primary: target,
    fallbacks,
    strategy,
  };
}

/**
 * Convert a SelectorSpec into the string form that Playwright's page.locator() accepts.
 * Discovery already produces Playwright-compatible selectors, so this is a pass-through.
 */
export function toPlaywrightLocator(spec: SelectorSpec): string {
  return spec.primary;
}
