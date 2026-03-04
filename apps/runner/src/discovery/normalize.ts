const REJECT_PROTOCOLS = new Set(["mailto:", "tel:", "javascript:", "data:", "blob:"]);

/**
 * Normalize a URL to a canonical form for deduplication.
 * - Strips fragment
 * - Optionally strips query string
 * - Removes trailing slash on non-root paths
 * - Rejects non-http(s) protocols
 * Returns empty string on parse failure or rejected protocol.
 */
export function normalizeUrl(raw: string, includeQueryParams: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }

  if (REJECT_PROTOCOLS.has(parsed.protocol)) {
    return "";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "";
  }

  // Strip fragment
  parsed.hash = "";

  // Handle query params
  if (!includeQueryParams) {
    parsed.search = "";
  } else {
    parsed.searchParams.sort();
  }

  // Remove default ports
  if (parsed.port === "80" && parsed.protocol === "http:") {
    parsed.port = "";
  }
  if (parsed.port === "443" && parsed.protocol === "https:") {
    parsed.port = "";
  }

  // Remove trailing slash on non-root paths
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}

/** Create a filesystem-safe slug from a URL for screenshot filenames. */
export function urlToSlug(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "unknown";
  }
  const raw = `${parsed.hostname}${parsed.pathname}`;
  return raw
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "index";
}
