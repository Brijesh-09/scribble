import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminClient } from "@/libs/supabase-admin";
import { COLUMNS } from "@/libs/notes-server";
import { rowToSave, type NoteRow } from "@/libs/notes";
import type { Save } from "@/libs/saves";

export const metadata: Metadata = {
  title: "Shared on Scribble",
  robots: { index: false, follow: false }, // private links should not show up in search engines
};

function Tile({ s }: { s: Save }) {
  const isLink = s.kind === "link" || s.kind === "social";
  const href = isLink ? s.content : s.fileUrl;
  const headline = s.note ?? s.title;
  const longNote = s.kind === "note" && !s.preview;
  const span = s.preview
    ? "row-span-2"
    : longNote && (s.content?.length ?? 0) > 140
      ? "col-span-2 row-span-2"
      : longNote && s.title.length > 40
        ? "col-span-2"
        : "";

  const body = s.preview ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={s.preview} alt="" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3.5">
        <p className="line-clamp-3 text-[15px] font-semibold leading-[1.25]">{headline}</p>
        <p className="mt-0.5 truncate text-[12px] text-white/60">{s.note ? s.title : s.meta}</p>
      </div>
    </>
  ) : (
    <div className="flex h-full flex-col justify-between bg-[var(--surface)] p-3.5">
      <p className="text-[12px] text-[var(--muted)]">{s.kind === "note" ? "Note" : s.meta}</p>
      <p
        className={`font-medium leading-[1.25] ${
          span.includes("row-span-2") ? "line-clamp-[9] text-[17px]" : "line-clamp-4 text-[15px]"
        }`}
      >
        {s.kind === "note" ? (s.content ?? s.title) : headline}
      </p>
    </div>
  );

  const box = "relative block h-full overflow-hidden rounded-[24px] border border-white/[0.07]";
  return (
    <li className={span}>
      {href && /^https?:\/\//i.test(href) ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={`${box} active:scale-[0.98]`}>
          {body}
        </a>
      ) : (
        <div className={box}>{body}</div>
      )}
    </li>
  );
}

async function SharedView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();

  const admin = adminClient();
  const { data: share } = await admin
    .from("shares")
    .select("user_id, scope, tag, note_id, title, created_at")
    .eq("token", token)
    .maybeSingle();
  if (!share) notFound();

  // a link only ever sees what its scope allows: one item, or the library (never the Inbox)
  let query = admin
    .from("notes")
    .select(COLUMNS)
    .eq("user_id", share.user_id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  query = share.scope === "item" ? query.eq("id", share.note_id) : query.eq("inbox", false);
  const { data: rows } = await query;

  const signed = await Promise.all(
    ((rows ?? []) as NoteRow[]).map(async (row) => {
      let fileUrl: string | null = null;
      if (row.storage_path) {
        const { data } = await admin.storage.from("scribble-uploads").createSignedUrl(row.storage_path, 3600);
        fileUrl = data?.signedUrl ?? null;
      }
      return rowToSave({ ...row, file_url: fileUrl, image_url: row.content_type === "image" ? fileUrl : null });
    })
  );
  const items = share.scope === "tag" ? signed.filter((s) => s.tags.includes(share.tag)) : signed;

  const date = new Date(share.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[640px] px-5 pb-20 pt-[max(env(safe-area-inset-top),28px)]">
      <header>
        <p className="text-[14px] text-[var(--muted)]">Shared with you</p>
        <h1 className="font-script mt-1 text-[60px] leading-[0.9]">{share.title}</h1>
        <svg aria-hidden viewBox="0 0 120 8" fill="none" className="mt-2 h-2 w-[110px] text-[var(--accent)]">
          <path d="M2 5c18-4 34 2 52-1s40 2 64-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="mt-3 text-[15px] text-[var(--muted)]">
          {items.length} {items.length === 1 ? "item" : "items"} · shared {date}
        </p>
      </header>

      {items.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-white/[0.07] bg-[var(--surface)] px-6 py-14 text-center text-[15px] leading-6 text-[var(--muted)]">
          There&apos;s nothing here right now.
        </div>
      ) : (
        <ul className="mt-6 grid auto-rows-[140px] grid-flow-dense grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((s) => (
            <Tile key={s.id} s={s} />
          ))}
        </ul>
      )}

      <footer className="mt-14 text-center text-[14px] text-[var(--muted)]">
        <a href="/" className="active:opacity-70">
          Made with <span className="font-script text-[26px] text-[var(--text)]">Scribble</span>
        </a>
      </footer>
    </main>
  );
}

export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <SharedView params={params} />
    </Suspense>
  );
}