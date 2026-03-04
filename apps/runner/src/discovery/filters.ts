import { matchesAnyPattern } from "../safety/denylist.js";

const RESOURCE_EXTENSIONS = new Set([
  ".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
  ".woff", ".woff2", ".ttf", ".eot", ".pdf", ".zip", ".gz",
  ".mp3", ".mp4", ".webm", ".webp", ".avif",
]);

/** Check if a URL is same-origin relative to the start URL. */
export function isSameOrigin(candidateUrl: string, startUrl: string): boolean {
  try {
    return new URL(candidateUrl).origin === new URL(startUrl).origin;
  } catch {
    return false;
  }
}

/** Check if a URL points to a static resource rather than a page. */
export function isResourceUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const dotIndex = pathname.lastIndexOf(".");
    if (dotIndex === -1) return false;
    const ext = pathname.slice(dotIndex);
    return RESOURCE_EXTENSIONS.has(ext);
  } catch {
    return false;
  }
}

/** Master filter: returns true if the URL should be crawled. */
export function shouldCrawl(
  candidateUrl: string,
  startUrl: string,
  sameOriginOnly: boolean,
  denyPatterns: string[],
): boolean {
  if (isResourceUrl(candidateUrl)) return false;
  if (sameOriginOnly && !isSameOrigin(candidateUrl, startUrl)) return false;
  if (matchesAnyPattern(candidateUrl, denyPatterns)) return false;
  return true;
}
