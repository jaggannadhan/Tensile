export function toJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

export function parseJsonSafe<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
