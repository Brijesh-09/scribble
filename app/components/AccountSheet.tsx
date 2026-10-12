"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { LogOut } from "lucide-react";
import { Sheet } from "./Sheet";
import { createClient } from "@/utils/supabase/client";

type Props = {
  email: string;
  createdAt: string;
  stats: { total: number; links: number; notes: number; files: number };
  onClose: () => void;
};

export function AccountSheet({ email, createdAt, stats, onClose }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const since = new Date(createdAt);
  const sinceText = Number.isNaN(since.getTime())
    ? ""
    : `Scribbling since ${since.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`;

  async function signOut() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signOut();
    if (error) {
      setBusy(false);
      setError("Couldn't sign out. Try again.");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  const tiles = [
    { label: "Saves", value: stats.total },
    { label: "Links", value: stats.links },
    { label: "Notes", value: stats.notes },
    { label: "Files & scribbles", value: stats.files },
  ];

  return (
    <Sheet title="Account" onClose={onClose}>
      <div className="pt-1">
        <div className="flex flex-col items-center text-center">
          <div className="grid size-20 place-items-center rounded-full bg-[var(--accent)] text-[var(--bg)]">
            <span className="font-script text-[48px] leading-none">{(email[0] ?? "?").toUpperCase()}</span>
          </div>
          <p className="mt-3 break-all text-[18px] font-semibold">{email}</p>
          {sinceText && <p className="mt-0.5 text-[14px] text-[var(--muted)]">{sinceText}</p>}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-3xl bg-white/[0.06] p-4">
              <p className="font-script text-[42px] leading-none">{t.value}</p>
              <p className="mt-1 text-[14px] text-[var(--muted)]">{t.label}</p>
            </div>
          ))}
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={busy}
          onClick={signOut}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff8a7a]/15 py-3.5 text-[16px] font-semibold text-[#ff8a7a] disabled:opacity-50"
        >
          <LogOut size={18} strokeWidth={1.9} />
          {busy ? "Signing out…" : "Sign out"}
        </motion.button>
        {error && <p className="mt-3 text-center text-[14px] text-[#ff8a7a]">{error}</p>}
      </div>
    </Sheet>
  );
}