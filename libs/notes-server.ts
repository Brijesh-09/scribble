export const COLUMNS =
  "id, title, content, content_type, storage_path, original_filename, mime_type, tags, created_at";

export function cleanTags(input: unknown): string[] {
  const list = Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (const t of list) {
    if (typeof t !== "string") continue;
    const v = t.trim().replace(/^#+/, "").replace(/\s+/g, " ").slice(0, 24);
    if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
    if (out.length >= 12) break;
  }
  return out;
}