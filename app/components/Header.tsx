"use client";

import { UserRound } from "lucide-react";

export function Header({ initial, onAccount }: { initial?: string; onAccount: () => void }) {
  return (
    <header className="flex items-start justify-between px-5 pt-4">
      <div>
        <h1 className="font-script text-[46px] leading-[0.9]">Scribble</h1>
        {/* hand-drawn underline from the sketch */}
        <svg aria-hidden viewBox="0 0 120 8" fill="none" className="mt-1.5 h-2 w-[110px] text-[var(--accent)]">
          <path d="M2 5c18-4 34 2 52-1s40 2 64-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="mt-2 text-[15px] text-[var(--muted)]">Drop it. Find it later.</p>
      </div>

      <button
        aria-label="Account"
        onClick={onAccount}
        className="glass grid size-10 place-items-center rounded-full transition-transform duration-100 ease-out active:scale-95"
      >
        {initial ? (
          <span className="font-script text-[24px] leading-none">{initial}</span>
        ) : (
          <UserRound size={20} strokeWidth={1.75} />
        )}
      </button>
    </header>
  );
}