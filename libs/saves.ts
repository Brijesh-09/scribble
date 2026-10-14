export type SaveKind = "link" | "social" | "file" | "note" | "scribble";

export type Save = {
  id: string;
  kind: SaveKind;
  title: string;
  meta: string;
  ago: string;
  tags: string[];
  note?: string;
  content?: string; // full text, or the normalized URL for links
  preview?: string; // blob URL while local, signed or remote URL once loaded from the server
  file?: File; // keep it so it can be uploaded
  remoteId?: string; // the notes.id once the server has it
  pending?: boolean; // saving in the background
  createdAt?: string; // ISO timestamp
  fileUrl?: string; // signed URL (or local blob) for opening the original file
  mime?: string;
  inbox?: boolean; // arrived by sharing and is waiting in the Inbox
  description?: string; // page description for links
  pinned?: boolean;
};

export type NewSave = Omit<Save, "id" | "ago" | "tags" | "remoteId" | "pending">;

export const ALL = "All";

// every save gets one automatic tag from its kind; users add their own on top
export const KIND_TAG: Record<SaveKind, string> = {
  link: "Links",
  social: "Social",
  file: "Files",
  note: "Notes",
  scribble: "Scribbles",
};

export const PINNED_TAG = "Pinned";

// where a link came from, worked out from its host
const SOURCES: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  [/(^|\.)(x\.com|twitter\.com)$/, "X"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)threads\.(net|com)$/, "Threads"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.watch)$/, "Facebook"],
  [/(^|\.)pinterest\.[a-z.]+$/, "Pinterest"],
  [/(^|\.)spotify\.com$/, "Spotify"],
  [/(^|\.)github\.com$/, "GitHub"],
];

export const SOURCE_TAGS: string[] = [...new Set(SOURCES.map(([, name]) => name)), "Web"];

// tags that are worked out automatically (never stored, never counted as yours)
export const SYSTEM_TAGS: string[] = [PINNED_TAG, ...Object.values(KIND_TAG), ...SOURCE_TAGS];

export function sourceTag(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  for (const [re, name] of SOURCES) if (re.test(h)) return name;
  return "Web";
}

// every tag a save carries on its own, before you add any
export function autoTags(s: { kind: SaveKind; meta: string; pinned?: boolean }): string[] {
  const tags = [KIND_TAG[s.kind]];
  if (s.kind === "link" || s.kind === "social") tags.push(sourceTag(s.meta));
  if (s.pinned) tags.push(PINNED_TAG);
  return tags;
}

// the filter chips for a set of saves: automatic ones first, then yours by popularity
export function deriveTags(items: Save[]) {
  const counts = new Map<string, number>();
  for (const s of items) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const system = SYSTEM_TAGS.filter((t) => counts.has(t));
  const custom = [...counts.keys()]
    .filter((t) => !SYSTEM_TAGS.includes(t))
    .sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
  return { all: [ALL, ...system, ...custom], custom };
}

export function cleanTag(raw: string, existing: string[]): string | null {
  const t = raw.trim().replace(/^#+/, "").replace(/\s+/g, " ").slice(0, 24);
  if (!t || t.toLowerCase() === ALL.toLowerCase()) return null;
  return existing.find((e) => e.toLowerCase() === t.toLowerCase()) ?? t; // reuse existing casing
}

export function uid() {
  // crypto.randomUUID only exists on https/localhost, so use a fallback
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const SOCIAL_HOST =
  /(^|\.)(instagram|x|twitter|youtube|youtu|reddit|pinterest|linkedin|threads|tiktok)\.(com|be)$/;

export function fromText(raw: string): NewSave {
  const text = raw.trim();

  if (/^(https?:\/\/|www\.)\S+$/i.test(text)) {
    try {
      const href = text.startsWith("www.") ? `https://${text}` : text;
      const url = new URL(href);
      const host = url.hostname.replace(/^www\./, "");
      const slug = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
      const pretty = slug.replace(/[-_]+/g, " ").replace(/\.\w{2,4}$/, "").trim();
      return {
        kind: SOCIAL_HOST.test(host) ? "social" : "link",
        title: pretty ? pretty.charAt(0).toUpperCase() + pretty.slice(1) : host,
        meta: host,
        content: href,
      };
    } catch {
      /* fall through to note */
    }
  }

  return {
    kind: "note",
    title: text.length > 80 ? `${text.slice(0, 80)}…` : text,
    meta: "Note",
    content: text,
  };
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fromFile(file: File, opts: { note?: string; preview?: string } = {}): NewSave {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toUpperCase() : "File";
  return {
    kind: "file",
    title: file.name,
    meta: `${ext} · ${formatBytes(file.size)}`,
    note: opts.note?.trim() || undefined,
    file,
    preview: opts.preview ?? (file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined),
  };
}

export function fromScribble(file: File, note?: string): NewSave {
  return {
    kind: "scribble",
    title: "Scribble",
    meta: "Drawing",
    note: note?.trim() || undefined,
    file,
    preview: URL.createObjectURL(file),
  };
}