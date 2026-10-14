"use client";

import { motion } from "motion/react";
import { AtSign, Check, FileText, Link2, PenLine, Pin, StickyNote } from "lucide-react";
import { SYSTEM_TAGS, type Save, type SaveKind } from "@/libs/saves";
import { SPRING } from "./Composer";

export type TileSize = "s" | "w" | "t" | "l"; // 1x1, 2x1, 1x2, 2x2

const SPAN: Record<TileSize, string> = {
  s: "",
  w: "col-span-2",
  t: "row-span-2",
  l: "col-span-2 row-span-2",
};

const ICONS: Record<SaveKind, typeof Link2> = {
  link: Link2,
  social: AtSign,
  file: FileText,
  note: StickyNote,
  scribble: PenLine,
};

const TINT: Record<SaveKind, string> = {
  link: "from-[#1e1e21] to-[#161618]",
  social: "from-[#2b2125] to-[#1b1719]",
  file: "from-[#1c2124] to-[#151819]",
  note: "from-[#2d2623] to-[#1d1a19]",
  scribble: "from-[#1e1e21] to-[#161618]",
};

type Props = {
  save: Save;
  size: TileSize;
  onOpen: (id: string) => void;
  onKeep?: (id: string) => void; // Inbox: one-tap move to the library
};

export function SaveRow({ save, size, onOpen, onKeep }: Props) {
  const Icon = ICONS[save.kind];
  const custom = save.tags.find((t) => !SYSTEM_TAGS.includes(t));
  const headline = save.note ?? save.title;
  const textCls = size === "w" ? "line-clamp-2 text-[17px]" : "line-clamp-2 text-[15px]";
  const room = onKeep ? "pr-10" : ""; // keep text clear of the keep button

  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: save.pending ? 0.65 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={SPRING}
      style={{ borderRadius: 24 }}
      className={`relative ${SPAN[size]}`}
    >
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => onOpen(save.id)}
        style={{ borderRadius: 24 }}
        className="relative block h-full w-full overflow-hidden border border-white/[0.07] text-left"
      >
        {save.preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={save.preview}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              className="absolute inset-0 size-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            {(custom || save.pinned) && (
              <span className="glass absolute right-3 top-3 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                {save.pinned && <Pin size={11} strokeWidth={2.25} className="text-[var(--accent)]" />}
                {custom && `#${custom}`}
              </span>
            )}
            <div className={`absolute inset-x-0 bottom-0 p-3.5 ${room}`}>
              <p className="line-clamp-2 text-[15px] font-semibold leading-[1.25] tracking-[-0.01em]">{headline}</p>
              <p className="mt-0.5 truncate text-[12px] text-white/60">
                {save.note ? save.title : save.meta} · {save.ago}
              </p>
            </div>
          </>
        ) : (
          <div className={`flex h-full flex-col justify-between bg-gradient-to-br p-3.5 ${TINT[save.kind]}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-white/[0.07] text-[var(--accent)]">
                <Icon size={18} strokeWidth={1.75} />
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                {save.pinned && <Pin size={14} strokeWidth={2.25} className="shrink-0 text-[var(--accent)]" />}
                {custom && (
                  <span className="truncate rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]">
                    #{custom}
                  </span>
                )}
              </span>
            </div>
            <div className={room}>
              <p className={`${textCls} font-medium leading-[1.25] tracking-[-0.01em]`}>{headline}</p>
              <p className="mt-1 truncate text-[12px] text-[var(--muted)]">
                {save.note ? save.title : save.meta} · {save.ago}
              </p>
            </div>
          </div>
        )}

        {/* saving in the background */}
        {save.pending && (
          <span className="absolute left-3 top-3 size-2 animate-pulse rounded-full bg-[var(--accent)]" />
        )}
      </motion.button>

      {onKeep && !save.pending && (
        <motion.button
          whileTap={{ scale: 0.88 }}
          aria-label="Keep in library"
          onClick={() => onKeep(save.id)}
          className="absolute bottom-2.5 right-2.5 grid size-9 place-items-center rounded-full bg-[var(--accent)] text-[var(--bg)] shadow-[0_4px_14px_rgba(0,0,0,0.45)]"
        >
          <Check size={18} strokeWidth={2.5} />
        </motion.button>
      )}
    </motion.li>
  );
}