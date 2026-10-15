"use client";

import { motion } from "motion/react";
import { Copy, Layers, Link2, Plus, Tag } from "lucide-react";
import { Header } from "./Header";
import { timeAgo } from "@/libs/notes";
import { scopeLabel, type Share } from "@/libs/shares";

type Props = {
  shares: Share[];
  loading: boolean;
  error: string | null;
  initial?: string;
  onAccount: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onCopy: (id: string) => void;
  onRetry: () => void;
};

const ICON = { all: Layers, tag: Tag, item: Link2 } as const;

export function SharePage({ shares, loading, error, initial, onAccount, onNew, onOpen, onCopy, onRetry }: Props) {
  return (
    <div className="mx-auto min-h-full w-full max-w-[430px] pb-44">
      <Header initial={initial} onAccount={onAccount} />

      <section className="mt-9 px-5">
        <h2 className="font-script text-[48px] leading-none">Share</h2>
        <p className="mt-2 text-[15px] leading-6 text-[var(--muted)]">
          Send a collection, or a single save, to anyone with a link. They don&apos;t need an account.
        </p>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onNew}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-3.5 text-[16px] font-semibold text-[var(--bg)]"
        >
          <Plus size={18} strokeWidth={2.25} /> New link
        </motion.button>

        {loading && shares.length === 0 ? (
          <div className="mt-5 space-y-3" aria-busy>
            {[0, 1].map((i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-3xl bg-white/[0.05]" />
            ))}
          </div>
        ) : error && shares.length === 0 ? (
          <div className="mt-5 rounded-[28px] border border-white/[0.07] bg-[var(--surface)] px-6 py-10 text-center">
            <p className="text-[15px] text-[var(--muted)]">{error}</p>
            <button
              onClick={onRetry}
              className="mt-4 rounded-full bg-[var(--text)] px-5 py-2 text-[15px] font-semibold text-[var(--bg)] active:scale-95"
            >
              Try again
            </button>
          </div>
        ) : shares.length === 0 ? (
          <div className="mt-5 rounded-[28px] border border-white/[0.07] bg-[var(--surface)] px-6 py-12 text-center">
            <p className="text-[16px]">No links yet.</p>
            <p className="mt-1 text-[15px] leading-6 text-[var(--muted)]">
              Make a link for a tag like Instagram or Design, for your whole library, or open any save and tap Share.
            </p>
          </div>
        ) : (
          <ul className="mt-5 space-y-3">
            {shares.map((s) => {
              const Icon = ICON[s.scope];
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-3xl border border-white/[0.07] bg-[var(--surface)] p-3.5"
                >
                  <button onClick={() => onOpen(s.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-[var(--accent)]">
                      <Icon size={20} strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[16px] font-medium">{s.title}</span>
                      <span className="block truncate text-[13px] text-[var(--muted)]">
                        {scopeLabel(s)} · {timeAgo(s.created_at)}
                      </span>
                    </span>
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    aria-label="Copy link"
                    onClick={() => onCopy(s.id)}
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.08]"
                  >
                    <Copy size={17} strokeWidth={1.9} />
                  </motion.button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}