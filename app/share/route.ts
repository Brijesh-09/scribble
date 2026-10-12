import { createClient } from "@/utils/supabase/server";
import { cleanUrl, unfurl } from "@/libs/unfurl";

const URL_RE = /https?:\/\/[^\s<>"'()]+/i;
const ALLOWED = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_BYTES = 4 * 1024 * 1024; // stays under Vercel's 4.5 MB request limit

type Input = { title: string; text: string; url: string; files: File[] };
type Supabase = Awaited<ReturnType<typeof createClient>>;

const go = (origin: string, params: Record<string, string>) =>
  Response.redirect(`${origin}/?${new URLSearchParams(params).toString()}`, 303);

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

const strip = (s: string) => s.replace(URL_RE, "").replace(/\s+/g, " ").trim();

async function saveFile(supabase: Supabase, userId: string, file: File, note: string): Promise<string | null> {
  if (!ALLOWED.includes(file.type)) return `${file.name}: only PNG, JPEG, WebP, GIF, PDF and DOCX can be saved`;
  if (file.size > MAX_BYTES) return `${file.name} is over 4 MB`;

  const ext = file.name.includes(".") ? file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin" : "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { data: upload, error: uploadError } = await supabase.storage
    .from("scribble-uploads")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    console.error("Share upload failed:", uploadError.message);
    return "Could not upload the file";
  }

  const { error } = await supabase.from("notes").insert({
    user_id: userId,
    title: file.name.slice(0, 200),
    content: note,
    content_type: file.type.startsWith("image/") ? "image" : "file",
    storage_path: upload.path,
    original_filename: file.name,
    mime_type: file.type,
    tags: [],
    inbox: true,
    meta: {},
  });
  if (error) {
    console.error("Share insert failed:", error.message);
    await supabase.storage.from("scribble-uploads").remove([upload.path]);
    return "Could not save the file";
  }
  return null;
}

async function handle(origin: string, input: Input) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return Response.redirect(`${origin}/login`, 303);

  try {
    /* files shared from a gallery or file manager */
    if (input.files.length) {
      const note = (input.text || input.title).slice(0, 500);
      let saved = 0;
      let problem: string | null = null;
      for (const file of input.files.slice(0, 10)) {
        const err = await saveFile(supabase, user.id, file, note);
        if (err) problem = err;
        else saved++;
      }
      if (!saved) return go(origin, { share_error: problem ?? "Couldn't save that" });
      return go(origin, { shared: "1" });
    }

    /* a link: Instagram and X put it in "text", browsers use "url" */
    const found = URL_RE.exec(input.url) ?? URL_RE.exec(input.text) ?? URL_RE.exec(input.title);
    if (found) {
      const url = cleanUrl(found[0].replace(/[.,;:!?]+$/, ""));
      const host = new URL(url).hostname.replace(/^www\./, "");
      const preview = await withTimeout(unfurl(url), 5000, {});

      const sharedText = strip(input.text);
      const sharedTitle = strip(input.title);
      // the words the app shared (a post's text, an article's title) beat a generic page title
      const title = (sharedText.length >= 3 ? sharedText : sharedTitle || preview.title || host).slice(0, 200);
      const description = preview.description ?? (sharedText && sharedText !== title ? sharedText.slice(0, 300) : undefined);

      const meta = Object.fromEntries(
        Object.entries({ image: preview.image, description, site: preview.site }).filter(([, v]) => v)
      );

      const { error } = await supabase.from("notes").insert({
        user_id: user.id,
        title,
        content: url,
        content_type: "url",
        tags: [],
        inbox: true,
        meta,
      });
      if (error) throw new Error(error.message);
      return go(origin, { shared: "1" });
    }

    /* plain text */
    const text = (input.text || input.title).trim().slice(0, 100000);
    if (!text) return go(origin, { share_error: "Nothing to save" });

    const { error } = await supabase.from("notes").insert({
      user_id: user.id,
      title: text.slice(0, 80),
      content: text,
      content_type: "text",
      tags: [],
      inbox: true,
      meta: {},
    });
    if (error) throw new Error(error.message);
    return go(origin, { shared: "1" });
  } catch (error) {
    console.error("Share failed:", error);
    return go(origin, { share_error: "Couldn't save that" });
  }
}

/* Android / Chrome share sheet */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const form = await request.formData().catch(() => null);
  if (!form) return go(origin, { share_error: "Couldn't read what was shared" });

  const str = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" ? v.trim() : "";
  };
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  return handle(origin, { title: str("title"), text: str("text"), url: str("url"), files });
}

/* iPhone Shortcut: opens /share?url=<shared link> in Safari */
export async function GET(request: Request) {
  const u = new URL(request.url);

  // a link on some other website must not be able to add things to your Inbox
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return Response.redirect(`${u.origin}/`, 303);

  const q = (key: string) => u.searchParams.get(key)?.trim() ?? "";

  // the Shortcut doesn't encode the link, so take everything after "url=" when it's raw
  const tail = /[?&]url=(.+)$/.exec(u.search)?.[1];
  const url = tail && tail.includes("://") ? tail : q("url");

  return handle(u.origin, { title: q("title"), text: q("text"), url, files: [] });
}