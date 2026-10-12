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
  preview?: string; // blob URL while local, signed URL once loaded from the server
  file?: File;
  remoteId?: string; // the notes.id once the server has it
  pending?: boolean; // saving in the background
  createdAt?: string; // ISO timestamp
  fileUrl?: string; // signed URL (or local blob) for opening the original file
  mime?: string;
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
export const SYSTEM_TAGS: string[] = Object.values(KIND_TAG);

export const SEED: Save[] = [
  { id: "1", kind: "link", title: "How Linear builds product", meta: "linear.app", ago: "2m", tags: ["Links", "Design"] },
  { id: "2", kind: "social", title: "Thread on designing calm interfaces", meta: "x.com", ago: "1h", tags: ["Social", "Design", "Read later"] },
  { id: "3", kind: "file", title: "Q4-roadmap.pdf", meta: "PDF · 2.4 MB", ago: "3h", tags: ["Files", "Work"], note: "Check the launch dates" },
  { id: "4", kind: "note", title: "Ship the share sheet before the weekend", meta: "Note", ago: "Yesterday", tags: ["Notes", "Ideas"] },
  { id: "5", kind: "social", title: "Reel: 5-minute desk setup", meta: "instagram.com", ago: "2d", tags: ["Social", "Inspo"] },
];

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