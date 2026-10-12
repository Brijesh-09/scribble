"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CircleHelp, Trash2 } from "lucide-react";
import { Header } from "./Header";
import { SPRING } from "./Composer";
import type { Save } from "@/libs/saves";

type Props = {
  items: Save[];
  loading: boolean;
  initial?: string;
  onAccount: () => void;
  onOpen: (id: string) => void;
  onKeep: (id: string) => void;
  onDiscard: (id: string) => void;
  onHelp: () => void;
};

export function InboxPage({ items, loading, initial, onAccount, onOpen, onKeep, onDiscard, onHelp }: Props) {
  return (
    <div className="mx-auto min-h-full w-full max-w-[430px] pb-44">
      <Header initial={initial} onAccount={onAccount} />

      <section className="mt-9 px-5">
        <div className="flex items-end justify-between">
          <h2 className="font-script text-[48px] leading-none">Inbox</h2>
          <button
            aria-label="How sharing works"
            onClick={onHelp}
            className="grid size-9 place-items-center rounded-full bg-white/[0.08] text-[var(--muted)] active:scale-95"
          >
            <CircleHelp size={18} strokeWidth={1.75} />
          </button>
        </div>
        <p className="mt-2 text-[15px] leading-6 text-[var(--muted)]">
          Shared from other apps. Keep what matters, drop the rest.
        </p>

        {loading && items.length === 0 ? (
          <div className="mt-5 space-y-3" aria-busy>
            {[0, 1].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-[28px] bg-white/[0.05]" />
            ))}
          </div>
        ) : (
          <>
            <ul className="mt-5 space-y-3">
              <AnimatePresence initial={false}>
                {items.map((save) => (
                  <motion.li
                    key={save.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: save.pending ? 0.65 : 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={SPRING}
                    style={{ borderRadius: 28 }}
                    className="overflow-hidden border border-white/[0.07] bg-[var(--surface)]"
                  >
                    <button onClick={() => onOpen(save.id)} className="block w-full text-left">
                      {save.preview && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={save.preview}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                          className="h-40 w-full object-cover"
                        />
                      )}
                      <div className="px-4 pb-3 pt-3.5">
                        <p className="line-clamp-2 text-[17px] font-medium leading-[1.3]">{save.note ?? save.title}</p>
                        {save.description && (
                          <p className="mt-1 line-clamp-2 text-[14px] leading-5 text-[var(--muted)]">
                            {save.description}
                          </p>
                        )}
                        <p className="mt-2 truncate text-[12px] text-[var(--muted)]">
                          {save.meta} · {save.ago}
                        </p>
                      </div>
                    </button>

                    <div className="flex gap-2 px-3 pb-3">
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        disabled={save.pending}
                        onClick={() => onDiscard(save.id)}
                        className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/[0.07] py-2.5 text-[15px] font-medium text-[var(--muted)] disabled:opacity-40"
                      >
                        <Trash2 size={16} strokeWidth={1.9} /> Discard
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        disabled={save.pending}
                        onClick={() => onKeep(save.id)}
                        className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-2.5 text-[15px] font-semibold text-[var(--bg)] disabled:opacity-40"
                      >
                        <Check size={16} strokeWidth={2.25} /> Keep
                      </motion.button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>

            {items.length === 0 && (
              <div className="mt-5 rounded-[28px] border border-white/[0.07] bg-[var(--surface)] px-6 py-12 text-center">
                <p className="text-[16px] leading-6">Nothing waiting.</p>
                <p className="mt-1 text-[15px] leading-6 text-[var(--muted)]">
                  Share a post from Instagram, X or any website and pick Scribble.
                </p>
                <button
                  onClick={onHelp}
                  className="mt-4 rounded-full bg-[var(--text)] px-5 py-2 text-[15px] font-semibold text-[var(--bg)] active:scale-95"
                >
                  Set up sharing
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}