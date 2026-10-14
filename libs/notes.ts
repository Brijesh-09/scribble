import { autoTags, fromText, KIND_TAG, SYSTEM_TAGS, type NewSave, type Save } from "@/libs/saves";

/* ---------- errors ---------- */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function errorMessage(err: unknown) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof TypeError) return "You're offline. Try again in a moment.";
  return err instanceof Error ? err.message : "Something went wrong";
}

async function parse(res: Response) {
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(json?.error ?? "Something went wrong", res.status);
  return json;
}

/* ---------- row <-> Save ---------- */

export type NoteRow = {
  id: string | number;
  title: string;
  content: string;
  content_type: "text" | "url" | "image" | "file";
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  tags?: string[] | null;
  inbox?: boolean | null;
  pinned?: boolean | null;
  meta?: { image?: string; description?: string; site?: string } | null;
  created_at: string;
  file_url?: string | null;
  image_url?: string | null;
};

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 172800) return "Yesterday";
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function extOf(name: string, mime: string | null) {
  if (name.includes(".")) return name.split(".").pop()!.toUpperCase();
  return mime?.split("/")[1]?.toUpperCase() ?? "File";
}

export function rowToSave(row: NoteRow): Save {
  const id = String(row.id);
  const stored = row.tags ?? [];
  let item: NewSave;

  if (row.content_type === "url") {
    const parsed = fromText(row.content);
    const info = row.meta ?? {};
    item = {
      ...parsed,
      title: row.title && row.title !== row.content ? row.title : parsed.title,
      preview: info.image,
      description: info.description,
    };
  } else if (row.content_type === "text") {
    item = { kind: "note", title: row.title || row.content.slice(0, 80), meta: "Note", content: row.content };
  } else {
    const name = row.original_filename ?? row.title;
    const isScribble = row.content_type === "image" && stored.includes(KIND_TAG.scribble);
    item = isScribble
      ? {
          kind: "scribble",
          title: "Scribble",
          meta: "Drawing",
          note: row.content || undefined,
          preview: row.image_url ?? undefined,
        }
      : {
          kind: "file",
          title: name,
          meta: extOf(name, row.mime_type),
          note: row.content || undefined,
          preview: row.content_type === "image" ? (row.file_url ?? undefined) : undefined,
        };
  }

  return {
    ...item,
    id,
    remoteId: id,
    ago: timeAgo(row.created_at),
    createdAt: row.created_at,
    fileUrl: row.file_url ?? undefined,
    mime: row.mime_type ?? undefined,
    inbox: !!row.inbox,
    pinned: !!row.pinned,
    tags: Array.from(new Set([...autoTags({ kind: item.kind, meta: item.meta, pinned: !!row.pinned }), ...stored])),
  };
}

/* ---------- API calls ---------- */

export async function fetchNotes(): Promise<Save[]> {
  const json = await parse(await fetch("/api/notes", { cache: "no-store" }));
  return (json.items as NoteRow[]).map(rowToSave);
}

// automatic tags (Links, Instagram, Pinned...) are derived on load;
// only your own tags and "Scribbles" are stored
export function storedTags(tags: string[]) {
  return tags.filter((t) => t === KIND_TAG.scribble || !SYSTEM_TAGS.includes(t));
}

export async function createNote(item: NewSave, tags: string[]): Promise<string> {
  const stored = storedTags(tags);

  let res: Response;
  if (item.file) {
    const fd = new FormData();
    fd.append("file", item.file);
    fd.append("content", item.note ?? "");
    fd.append("tags", JSON.stringify(stored));
    res = await fetch("/api/notes", { method: "POST", body: fd });
  } else {
    res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: item.content ?? item.title,
        title: item.kind === "note" ? undefined : item.title, // the server derives note titles itself
        tags: stored,
      }),
    });
  }
  const json = await parse(res);
  return String(json.note.id);
}

export async function deleteNote(remoteId: string) {
  await parse(await fetch(`/api/notes/${encodeURIComponent(remoteId)}`, { method: "DELETE" }));
}

export type NotePatch = {
  title?: string;
  content?: string;
  tags?: string[];
  inbox?: boolean;
  pinned?: boolean;
};

export async function updateNote(remoteId: string, patch: NotePatch) {
  await parse(
    await fetch(`/api/notes/${encodeURIComponent(remoteId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
  );
}

/* ---------- file prep: match the API's rules, shrink big photos ---------- */

const ALLOWED = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
// your API allows 5 MB; staying at 4 MB keeps uploads under Vercel's 4.5 MB request limit
const MAX_BYTES = 4 * 1024 * 1024;

export async function prepareFile(file: File): Promise<File> {
  const isImage = file.type.startsWith("image/");
  const unsupportedImage = isImage && !ALLOWED.includes(file.type); // e.g. HEIC
  const tooBig = file.size > MAX_BYTES;

  // phone photos are usually too big: re-encode as JPEG instead of rejecting them
  if (isImage && file.type !== "image/gif" && (unsupportedImage || tooBig)) {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) throw new Error(`${file.name}: this image format can't be read`);

    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();

    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
      if (blob && blob.size <= MAX_BYTES) {
        return new File([blob], `${file.name.replace(/\.\w+$/, "")}.jpg`, { type: "image/jpeg" });
      }
    }
    throw new Error(`${file.name} is too large`);
  }

  if (!ALLOWED.includes(file.type)) {
    throw new Error(`${file.name}: only PNG, JPEG, WebP, GIF, PDF and DOCX files are supported`);
  }
  if (tooBig) throw new Error(`${file.name} is over ${MAX_BYTES / 1024 / 1024} MB`);
  return file;
}