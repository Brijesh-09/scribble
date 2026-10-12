"use client";

import { motion, useTransform, type MotionValue } from "motion/react";
import { House, Inbox, PenLine, Share } from "lucide-react";

const TABS = [
  { label: "Home", icon: House },
  { label: "Scribble", icon: PenLine },
  { label: "Inbox", icon: Inbox },
  { label: "Share", icon: Share },
] as const;

type Props = {
  pos: MotionValue<number>; // fractional page index, shared with the pager
  active: number;
  onSelect: (index: number) => void;
};

export function TabBar({ pos, active, onSelect }: Props) {
  // 1 when the full-screen scribble pad is fully in view, 0 two pages away
  const away = useTransform(pos, (p) => Math.max(0, 1 - Math.abs(p - 1)));
  const y = useTransform(away, (a) => a * 150);
  const opacity = useTransform(away, (a) => 1 - a);

  // the pill follows the page, and stays put when the pager rubber-bands past the ends
  const pillX = useTransform(pos, (p) => `${Math.min(3, Math.max(0, p)) * 100}%`);

  return (
    <motion.div
      style={{ y, opacity }}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px]"
    >
      {/* scroll-edge fade instead of a hard divider */}
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/80 to-transparent" />

      <nav inert={active === 1} className="relative px-4 pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="glass pointer-events-auto relative flex rounded-[30px] p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
          <motion.span
            style={{ x: pillX }}
            className="absolute inset-y-1.5 left-1.5 w-[calc((100%-12px)/4)] rounded-3xl bg-white/10"
          />
          {TABS.map(({ label, icon: Icon }, i) => {
            const on = i === active;
            return (
              <motion.button
                key={label}
                whileTap={{ scale: 0.94 }}
                aria-current={on ? "page" : undefined}
                onClick={() => onSelect(i)}
                className={`relative z-10 flex flex-1 flex-col items-center gap-1 rounded-3xl py-2.5 text-[11px] font-medium tracking-[0.01em] transition-colors duration-150 ${
                  on ? "text-[var(--text)]" : "text-[var(--muted)]"
                }`}
              >
                <Icon size={22} strokeWidth={on ? 2 : 1.6} />
                <span>{label}</span>
              </motion.button>
            );
          })}
        </div>
      </nav>
    </motion.div>
  );
}