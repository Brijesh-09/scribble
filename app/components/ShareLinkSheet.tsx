"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Check, Copy, Share2 } from "lucide-react";
import { Sheet } from "./Sheet";
import { copyLink, scopeLabel, sendLink, shareUrl, type Share } from "@/libs/shares";

type Props = { share: Share; onStop: (id: string) => void; onClose: () => void };

export function ShareLinkSheet({ share, onStop, onClose }: Props) {
  const url = shareUrl(share.token);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function flash() {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function copy() {
    setProblem(null);
    try {
      await copyLink(url);
      flash();
    } catch {
      setProblem("Couldn't copy. Press and hold the link to copy it by hand.");
    }
  }

  async function send() {
    setProblem(null);
    try {
      const result = await sendLink(url, share.title);
      if (result === "copied") flash();
    } catch {
      setProblem("Couldn't share. Press and hold the link to copy it by hand.");
    }
  }

  return (
    <Sheet title="Link ready" onClose={onClose}>
      <div className="space-y-5 pt-1">
        <div>
          <p className="text-[18px] font-semibold leading-snug">{share.title}</p>
          <p className="mt-0.5 text-[14px] text-[var(--muted)]">{scopeLabel(share)}</p>
        </div>

        <div className="select-all break-all rounded-2xl bg-white/[0.06] p-4 text-[14px] leading-5">{url}</div>

        <div className="flex gap-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={copy}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/[0.08] py-3.5 text-[16px] font-semibold"
          >
            {copied ? <Check size={17} strokeWidth={2.25} /> : <Copy size={17} strokeWidth={1.9} />}
            {copied ? "Copied" : "Copy"}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={send}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-3.5 text-[16px] font-semibold text-[var(--bg)]"
          >
            <Share2 size={17} strokeWidth={1.9} /> Share
          </motion.button>
        </div>

        {problem && <p className="text-center text-[14px] text-[#ff8a7a]">{problem}</p>}

        <p className="text-[13px] leading-5 text-[var(--muted)]">
          Anyone with this link can view it, without an account. Stopping the link makes it stop working straight away.
        </p>

        {confirm ? (
          <div className="rounded-3xl bg-[#ff8a7a]/10 p-4">
            <p className="text-center text-[16px]">Stop sharing this link?</p>
            <div className="mt-3 flex gap-3">
              <button
                onClick={() => setConfirm(false)}
                className="flex-1 rounded-2xl bg-white/[0.08] py-3 text-[16px] font-semibold active:scale-[0.97]"
              >
                Keep it
              </button>
              <button
                onClick={() => onStop(share.id)}
                className="flex-1 rounded-2xl bg-[#ff8a7a]/15 py-3 text-[16px] font-semibold text-[#ff8a7a] active:scale-[0.97]"
              >
                Stop sharing
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            className="w-full rounded-2xl bg-[#ff8a7a]/15 py-3.5 text-[16px] font-semibold text-[#ff8a7a] active:scale-[0.97]"
          >
            Stop sharing
          </button>
        )}
      </div>
    </Sheet>
  );
}