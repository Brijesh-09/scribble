"use client";

import { Layers, Tag } from "lucide-react";
import { Sheet } from "./Sheet";

export type ShareOption = { label: string; scope: "all" | "tag"; tag?: string; count: number };

type Props = {
  options: ShareOption[];
  busy: boolean;
  onPick: (option: ShareOption) => void;
  onClose: () => void;
};

export function ShareNewSheet({ options, busy, onPick, onClose }: Props) {
  return (
    <Sheet title="New link" onClose={onClose}>
      <div className="pt-1">
        <p className="text-[15px] leading-6 text-[var(--muted)]">
          Choose what to share. Anyone with the link can view it, with no account, until you stop sharing.
        </p>

        <ul className="mt-4 space-y-2">
          {options.map((o) => (
            <li key={`${o.scope}:${o.tag ?? ""}`}>
              <button
                disabled={busy || o.count === 0}
                onClick={() => onPick(o)}
                className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3.5 text-left active:bg-white/10 disabled:opacity-40"
              >
                <span className="text-[var(--accent)]">
                  {o.scope === "all" ? <Layers size={19} strokeWidth={1.75} /> : <Tag size={19} strokeWidth={1.75} />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[16px]">{o.label}</span>
                <span className="shrink-0 text-[14px] text-[var(--muted)]">{o.count}</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[13px] leading-5 text-[var(--muted)]">
          A link to everything shows your whole library, but never your Inbox. A link to a tag stays up to date as you
          add to it.
        </p>
      </div>
    </Sheet>
  );
}