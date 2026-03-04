const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NUMERIC_PATH_ID_RE = /\/\d+(?=\/|$)/g;
const PORT_RE = /:\d{4,5}(?=\/|$)/g;
const TIMING_MS_RE = /\d+\s*ms/g;

/**
 * Normalize an error message (and optional URL) into a stable signature
 * for clustering. Dynamic segments (UUIDs, numeric IDs, ports, timings)
 * are collapsed so that similar errors group together.
 */
export function normalizeSignature(errorMessage: string, url?: string): string {
  // Keep only the first line (strip stack traces)
  let msg = errorMessage.split("\n")[0];

  // Collapse dynamic segments
  msg = msg.replace(UUID_RE, ":uuid");
  msg = msg.replace(NUMERIC_PATH_ID_RE, "/:id");
  msg = msg.replace(PORT_RE, ":port");
  msg = msg.replace(TIMING_MS_RE, "Nms");

  let sig = msg.toLowerCase().trim();

  // Optionally prepend normalized URL path
  if (url) {
    try {
      const u = new URL(url);
      let p = u.pathname;
      p = p.replace(UUID_RE, ":uuid");
      p = p.replace(NUMERIC_PATH_ID_RE, "/:id");
      sig = `[${p}] ${sig}`;
    } catch {
      // Invalid URL — skip prefix
    }
  }

  return sig;
}
