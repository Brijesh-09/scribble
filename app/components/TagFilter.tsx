"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { SPRING } from "./Composer";

const FADE = "linear-gradient(to right, transparent 0, #000 20px, #000 calc(100% - 28px), transparent 100%)";

export function TagFilter({
  tags,
  value,
  onChange,
}: {
  tags: string[];
  value: string;
  onChange: (tag: string) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  // keep the selected tag centered when there are many
  useEffect(() => {
    const box = row.current;
    const el = refs.current[value];
    if (!box || !el) return;
    box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: "smooth" });
  }, [value]);

  return (
    <div
      ref={row}
      data-no-swipe
      role="tablist"
      aria-label="Filter saves"
      className="no-scrollbar relative -mx-5 flex gap-2 overflow-x-auto px-5 py-1"
      style={{ maskImage: FADE, WebkitMaskImage: FADE }}
    >
      {tags.map((tag) => {
        const active = tag === value;
        return (
          <motion.button
            key={tag}
            ref={(el) => {
              refs.current[tag] = el;
            }}
            role="tab"
            aria-selected={active}
            whileTap={{ scale: 0.95 }}
            onClick={() => onChange(tag)}
            className="relative shrink-0 rounded-full bg-white/[0.07] px-4 py-2 text-[15px] font-medium"
          >
            {active && (
              <motion.span
                layoutId="tag-pill"
                transition={SPRING}
                className="absolute inset-0 rounded-full bg-[var(--text)]"
              />
            )}
            <span className={`relative ${active ? "text-[var(--bg)]" : "text-[var(--muted)]"}`}>{tag}</span>
          </motion.button>
        );
      })}
    </div>
  );
}