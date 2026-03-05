export function deriveProjectSlug(url: string): string {
  const u = new URL(url);
  const host = u.hostname.replace(/\./g, "-");
  const firstSegment = u.pathname.split("/").filter(Boolean)[0] || "root";
  return `${host}__${firstSegment}`;
}
