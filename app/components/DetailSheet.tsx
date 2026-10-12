"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { AtSign, ExternalLink, FileText, Link2, PenLine, Pencil, StickyNote, Trash2 } from "lucide-react";
import { Sheet } from "./Sheet";
import { cleanTag, SYSTEM_TAGS, type Save, type SaveKind } from "@/libs/saves";

export type Edits = { title?: string; content?: string; note?: string; tags?: string[] };

const KIND_LABEL: Record<SaveKind, string> = {
  link: "Link",
  social: "Social post",
  file: "File",
  note: "Note",
  scribble: "Scribble",
};

const ICONS: Record<SaveKind, typeof Link2> = {
  link: Link2,
  social: AtSign,
  file: FileText,
  note: StickyNote,
  scribble: PenLine,
};

type Props = {
  save: Save;
  tagSuggestions: string[];
  onClose: () => void;
  onEdit: (id: string, edits: Edits) => void;
  onDelete: (id: string) => void;
};

function formatDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function DetailSheet({ save, tagSuggestions, onClose, onEdit, onDelete }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [text, setText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  const isNote = save.kind === "note";
  const isLink = save.kind === "link" || save.kind === "social";
  const Icon = ICONS[save.kind];
  const customTags = save.tags.filter((t) => !SYSTEM_TAGS.includes(t));
  const kindTag = save.tags.find((t) => SYSTEM_TAGS.includes(t));
  const created = formatDate(save.createdAt);
  const href = isLink && save.content && /^https?:\/\//i.test(save.content) ? save.content : undefined;
  const fileHref = useMemo(
    () => save.fileUrl ?? (save.file ? URL.createObjectURL(save.file) : undefined),
    [save.fileUrl, save.file]
  );
  const busy = !!save.pending;

  const current = isNote ? (save.content ?? save.title) : isLink ? save.title : (save.note ?? "");
  const canCommit = isNote || isLink ? text.trim().length > 0 : true;

  function startEdit() {
    setText(current);
    setTags(customTags);
    setNewTag("");
    setMode("edit");
  }

  function addTag() {
    const t = cleanTag(newTag, [...SYSTEM_TAGS, ...tagSuggestions, ...tags]);
    setNewTag("");
    if (t && !tags.includes(t)) setTags((p) => [...p, t]);
  }

  function commit() {
    const pending = cleanTag(newTag, [...SYSTEM_TAGS, ...tagSuggestions, ...tags]);
    const finalTags = pending && !tags.includes(pending) ? [...tags, pending] : tags;
    const value = text.trim();

    const edits: Edits = { tags: finalTags };
    if (isNote) edits.content = value;
    else if (isLink) edits.title = value;
    else edits.note = value;

    onEdit(save.id, edits);
    setMode("view");
  }

  return (
    <Sheet title={KIND_LABEL[save.kind]} onClose={onClose}>
      <div className="space-y-5 pt-1">
        {/* image first, for photos and scribbles */}
        {save.preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={save.preview} alt="" className="max-h-[48dvh] w-full rounded-3xl bg-black/30 object-contain" />
        )}

        {mode === "edit" ? (
          <label className="block">
            <span className="mb-1.5 block text-[13px] text-[var(--muted)]">
              {isNote ? "Your note" : isLink ? "Title" : "Note to remember it by"}
            </span>
            {isLink ? (
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full rounded-2xl bg-white/[0.07] px-4 py-3 text-[17px] outline-none"
              />
            ) : (
              <textarea
                autoFocus
                rows={isNote ? 8 : 4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={isNote ? "" : "Why did you save this?"}
                className="w-full resize-none rounded-2xl bg-white/[0.07] px-4 py-3 text-[17px] leading-6 outline-none placeholder:text-[var(--muted)]"
              />
            )}
          </label>
        ) : isNote ? (
          <p className="select-text whitespace-pre-wrap break-words text-[19px] leading-7">{save.content ?? save.title}</p>
        ) : isLink ? (
          <div>
            <h3 className="text-[22px] font-semibold leading-tight">{save.title}</h3>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block break-all text-[15px] text-[var(--accent)] underline underline-offset-4"
              >
                {save.content}
              </a>
            ) : (
              <p className="mt-2 break-all text-[15px] text-[var(--muted)]">{save.content}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {save.kind === "file" && !save.preview && (
              <div className="flex items-center gap-3 rounded-3xl bg-white/[0.06] p-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/[0.07] text-[var(--accent)]">
                  <Icon size={22} strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-medium">{save.title}</p>
                  <p className="text-[13px] text-[var(--muted)]">{save.meta}</p>
                </div>
              </div>
            )}
            {save.note ? (
              <p className="select-text whitespace-pre-wrap break-words text-[19px] leading-7">{save.note}</p>
            ) : (
              <p className="text-[15px] text-[var(--muted)]">No note yet. Tap Edit to add one.</p>
            )}
          </div>
        )}

        {/* open the original */}
        {mode === "view" && (href || (!isLink && !isNote && fileHref)) && (
          <a
            href={href ?? fileHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-3.5 text-[16px] font-semibold text-[var(--bg)] active:scale-[0.98]"
          >
            <ExternalLink size={18} strokeWidth={2} />
            {href ? "Open link" : "Open file"}
          </a>
        )}

        {/* tags */}
        <div>
          <p className="mb-2 text-[13px] text-[var(--muted)]">Tags</p>
          {mode === "edit" ? (
            <div className="flex flex-wrap items-center gap-2">
              {tags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTags((p) => p.filter((x) => x !== t))}
                  className="rounded-full bg-[var(--text)] px-3 py-1.5 text-[13px] font-medium text-[var(--bg)]"
                >
                  #{t} ×
                </button>
              ))}
              {tagSuggestions
                .filter((t) => !tags.includes(t))
                .map((t) => (
                  <button
                    key={t}
                    onClick={() => setTags((p) => [...p, t])}
                    className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[13px] text-[var(--muted)]"
                  >
                    #{t}
                  </button>
                ))}
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
                enterKeyHint="done"
                placeholder="+ Add tag"
                className="w-24 bg-transparent px-2 py-1.5 text-[16px] outline-none placeholder:text-[var(--muted)]"
              />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {kindTag && (
                <span className="rounded-full border border-white/10 px-3 py-1.5 text-[13px] text-[var(--muted)]">
                  {kindTag}
                </span>
              )}
              {customTags.map((t) => (
                <span key={t} className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[13px]">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* details */}
        <dl className="divide-y divide-white/[0.07] rounded-3xl bg-white/[0.05] px-4 text-[15px]">
          <Row label="Created" value={created ?? save.ago} />
          <Row label="Type" value={KIND_LABEL[save.kind]} />
          {isLink && <Row label="Site" value={save.meta} />}
          {save.kind === "file" && <Row label="File" value={`${save.title} · ${save.meta}`} />}
        </dl>

        {/* actions */}
        {busy ? (
          <p className="py-2 text-center text-[15px] text-[var(--muted)]">Saving…</p>
        ) : mode === "view" ? (
          <div className="flex gap-3">
            <Action onClick={startEdit}>
              <Pencil size={17} strokeWidth={1.9} /> Edit
            </Action>
            <Action tone="danger" onClick={() => setMode("confirm")}>
              <Trash2 size={17} strokeWidth={1.9} /> Delete
            </Action>
          </div>
        ) : mode === "edit" ? (
          <div className="flex gap-3">
            <Action onClick={() => setMode("view")}>Cancel</Action>
            <Action tone="primary" disabled={!canCommit} onClick={commit}>
              Save changes
            </Action>
          </div>
        ) : (
          <div className="rounded-3xl bg-[#ff8a7a]/10 p-4">
            <p className="text-center text-[16px]">Delete this for good?</p>
            <div className="mt-3 flex gap-3">
              <Action onClick={() => setMode("view")}>Keep it</Action>
              <Action tone="danger" onClick={() => onDelete(save.id)}>
                Delete
              </Action>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="min-w-0 truncate text-right">{value}</dd>
    </div>
  );
}

function Action({
  children,
  onClick,
  tone = "plain",
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "plain" | "primary" | "danger";
  disabled?: boolean;
}) {
  const look =
    tone === "primary"
      ? "bg-[var(--accent)] text-[var(--bg)]"
      : tone === "danger"
        ? "bg-[#ff8a7a]/15 text-[#ff8a7a]"
        : "bg-white/[0.08]";
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] font-semibold disabled:opacity-40 ${look}`}
    >
      {children}
    </motion.button>
  );
}