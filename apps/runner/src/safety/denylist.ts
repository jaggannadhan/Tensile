export const DEFAULT_DENY_PATTERNS: string[] = [
  "delete",
  "remove",
  "destroy",
  "close account",
  "cancel subscription",
  "refund",
  "terminate",
  "wipe",
  "drop",
];

export const HARD_BLOCK_PATTERNS: string[] = [
  "delete account",
  "close account",
  "wipe",
  "terminate account",
];

export function matchesPattern(text: string, pattern: string): boolean {
  return text.toLowerCase().includes(pattern.toLowerCase());
}

export function matchesAnyPattern(text: string, patterns: string[]): string | null {
  for (const p of patterns) {
    if (matchesPattern(text, p)) return p;
  }
  return null;
}
