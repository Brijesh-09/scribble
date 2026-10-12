"use client";

import { useState, type ReactNode } from "react";
import { Sheet } from "./Sheet";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[17px] font-semibold">{title}</h3>
      <div className="space-y-2 text-[15px] leading-6 text-[var(--muted)]">{children}</div>
    </div>
  );
}

export function ShareSetupSheet({ onClose }: { onClose: () => void }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const template = `${origin}/share?url=`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <Sheet title="Share to Scribble" onClose={onClose}>
      <div className="space-y-6 pt-1">
        <p className="text-[15px] leading-6 text-[var(--muted)]">
          Share a post or page from any app and it lands in your Inbox, ready to keep.
        </p>

        <Block title="Android (Chrome)">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Open Scribble in Chrome, then tap the menu (⋮) and choose Install app.</li>
            <li>In Instagram, X, your browser or any app, tap Share and pick Scribble.</li>
            <li>It opens straight to your Inbox.</li>
          </ol>
        </Block>

        <Block title="iPhone">
          <p>iOS doesn&apos;t let websites appear in the share sheet, so you make a tiny Shortcut once:</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Log in to Scribble in Safari first.</li>
            <li>
              Open Shortcuts, tap +, and name it &ldquo;Scribble&rdquo;. In its details, turn on Show in Share Sheet and
              accept URLs and Text.
            </li>
            <li>Add a Text action containing the link below, then insert the Shortcut Input variable right after it.</li>
            <li>Add an Open URLs action and pass it that Text.</li>
            <li>In any app, tap Share, then Shortcuts, then Scribble.</li>
          </ol>
          <div className="flex items-center gap-2 rounded-2xl bg-white/[0.06] p-3">
            <code className="min-w-0 flex-1 break-all text-[13px] text-[var(--text)]">{template}</code>
            <button
              onClick={copy}
              className="shrink-0 rounded-full bg-[var(--text)] px-3 py-1.5 text-[13px] font-semibold text-[var(--bg)] active:scale-95"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </Block>

        <Block title="Desktop">
          <p>
            In Chrome or Edge, install Scribble from the address bar, then use the browser&apos;s Share menu on any page.
            Or just paste links into the box on Home.
          </p>
        </Block>
      </div>
    </Sheet>
  );
}