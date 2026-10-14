"use client";

import { CircleHelp } from "lucide-react";
import { Header } from "./Header";
import { Feed } from "./Feed";
import type { Save } from "@/libs/saves";

type Props = {
  items: Save[];
  loading: boolean;
  loadError: string | null;
  resetKey: number;
  initial?: string;
  onRetry: () => void;
  onAccount: () => void;
  onOpen: (id: string) => void;
  onKeep: (id: string) => void;
  onKeepAll: () => void;
  onHelp: () => void;
};

export function InboxPage({
  items,
  loading,
  loadError,
  resetKey,
  initial,
  onRetry,
  onAccount,
  onOpen,
  onKeep,
  onKeepAll,
  onHelp,
}: Props) {
  return (
    <div className="mx-auto min-h-full w-full max-w-[430px] pb-44">
      <Header initial={initial} onAccount={onAccount} />

      <section className="mt-9 px-5">
        <div className="flex items-end justify-between">
          <h2 className="font-script text-[48px] leading-none">Inbox</h2>
          <div className="flex items-center gap-2">
            {items.length > 1 && (
              <button
                onClick={onKeepAll}
                className="rounded-full bg-white/[0.08] px-3.5 py-2 text-[14px] font-medium active:scale-95"
              >
                Keep all
              </button>
            )}
            <button
              aria-label="How sharing works"
              onClick={onHelp}
              className="grid size-9 place-items-center rounded-full bg-white/[0.08] text-[var(--muted)] active:scale-95"
            >
              <CircleHelp size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <p className="mt-2 text-[15px] leading-6 text-[var(--muted)]">
          Shared from other apps. Tap the check to keep one, or open it to review.
        </p>

        <Feed
          items={items}
          resetKey={resetKey}
          loading={loading}
          loadError={loadError}
          onRetry={onRetry}
          onOpen={onOpen}
          onKeep={onKeep}
          empty={
            <div className="rounded-[28px] border border-white/[0.07] bg-[var(--surface)] px-6 py-12 text-center">
              <p className="text-[16px] leading-6">All caught up.</p>
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
          }
        />
      </section>
    </div>
  );
}