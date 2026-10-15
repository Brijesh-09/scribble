"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  animate,
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react";
import { CircleAlert } from "lucide-react";
import { Header } from "@/app/components/Header";
import { Composer, SPRING } from "@/app/components/Composer";
import { Feed } from "@/app/components/Feed";
import { ScribblePad } from "@/app/components/Scribblepad";
import { TabBar } from "@/app/components/TabBar";
import { Pager } from "@/app/components/Pager";
import { InboxPage } from "@/app/components/InboxPage";
import { SharePage } from "@/app/components/SharePage";
import { DetailSheet, type Edits } from "@/app/components/DetailSheet";
import { AccountSheet } from "@/app/components/AccountSheet";
import { ShareSetupSheet } from "@/app/components/ShareSetupSheet";
import { ShareNewSheet, type ShareOption } from "@/app/components/ShareNewSheet";
import { ShareLinkSheet } from "@/app/components/ShareLinkSheet";
import { ALL, autoTags, deriveTags, PINNED_TAG, uid, type NewSave, type Save } from "@/libs/saves";
import {
  ApiError,
  createNote,
  deleteNote,
  errorMessage,
  fetchNotes,
  prepareFile,
  storedTags,
  updateNote,
} from "@/libs/notes";
import { copyLink, createShare, deleteShare, fetchShares, shareUrl, type Share } from "@/libs/shares";

type Toast = { key: string; message: string; ids?: string[]; error?: boolean };
type User = { email: string; createdAt: string };

const withPin = (s: Save, pinned: boolean): Save => ({
  ...s,
  pinned,
  tags: pinned ? Array.from(new Set([...s.tags, PINNED_TAG])) : s.tags.filter((t) => t !== PINNED_TAG),
});

export default function ScribbleApp({ user }: { user: User }) {
  const [saves, setSaves] = useState<Save[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [sharesLoading, setSharesLoading] = useState(true);
  const [sharesError, setSharesError] = useState<string | null>(null);
  const [feedReset, setFeedReset] = useState(0); // bump to clear search and filters in the feeds
  const [composing, setComposing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [shareNewOpen, setShareNewOpen] = useState(false);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [padKey, setPadKey] = useState(0); // bump to give the scribble pad a clean sheet

  const inflight = useRef(0); // saves currently uploading
  const cancelled = useRef(new Set<string>()); // undone before the server answered

  const initial = user.email ? user.email[0].toUpperCase() : undefined;
  const openAccount = useCallback(() => setAccountOpen(true), []);

  const showToast = useCallback((t: Omit<Toast, "key">) => setToast({ ...t, key: uid() }), []);

  /* ---------- page navigation: one number drives pager, tab pill and tab bar ---------- */
  const pos = useMotionValue(0); // 0 Home, 1 Scribble, 2 Inbox, 3 Share
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const anim = useRef<ReturnType<typeof animate> | null>(null);

  useMotionValueEvent(pos, "change", (v) => setActive(Math.min(3, Math.max(0, Math.round(v)))));

  const stop = useCallback(() => {
    anim.current?.stop();
    anim.current = null;
  }, []);

  const goTo = useCallback(
    (index: number, velocity = 0) => {
      stop();
      if (reduce) {
        pos.set(index); // no sliding for people who asked for less motion
        return;
      }
      anim.current = animate(pos, index, { type: "spring", bounce: 0, duration: 0.45, velocity });
    },
    [pos, reduce, stop]
  );

  /* ---------- coming back from a share: jump to the Inbox ---------- */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("shared") && !params.has("share_error")) return;
    const err = params.get("share_error");
    window.history.replaceState(null, "", window.location.pathname);
    if (err) {
      showToast({ message: err, error: true });
    } else {
      goTo(2);
      showToast({ message: "Saved to your Inbox" });
    }
  }, [goTo, showToast]);

  /* ---------- load from the API ---------- */
  const load = useCallback(async () => {
    try {
      const items = await fetchNotes();
      // keep anything still uploading on top, replace the rest with server truth
      setSaves((prev) => [...prev.filter((s) => s.pending), ...items]);
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadShares = useCallback(async () => {
    try {
      setShares(await fetchShares());
      setSharesError(null);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) setSharesError(errorMessage(err));
    } finally {
      setSharesLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadShares();
  }, [load, loadShares]);

  const retry = useCallback(() => {
    setLoading(true);
    load();
  }, [load]);

  const retryShares = useCallback(() => {
    setSharesLoading(true);
    loadShares();
  }, [loadShares]);

  // signed image URLs last an hour, so refresh after a long absence
  useEffect(() => {
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < 30 * 60 * 1000 || inflight.current > 0) return;
      last = Date.now();
      load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  /* ---------- derived: library vs inbox, tag suggestions, share options, stats ---------- */
  const library = useMemo(() => saves.filter((s) => !s.inbox), [saves]);
  const inboxItems = useMemo(() => saves.filter((s) => s.inbox), [saves]);
  const customTags = useMemo(() => deriveTags(library).custom, [library]);

  const shareOptions = useMemo<ShareOption[]>(() => {
    const counts = new Map<string, number>();
    for (const s of library) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [
      { label: "Everything in your library", scope: "all", count: library.length },
      ...deriveTags(library)
        .all.filter((t) => t !== ALL)
        .map((t): ShareOption => ({ label: t, scope: "tag", tag: t, count: counts.get(t) ?? 0 })),
    ];
  }, [library]);

  const stats = useMemo(
    () => ({
      total: saves.length,
      links: saves.filter((s) => s.kind === "link" || s.kind === "social").length,
      notes: saves.filter((s) => s.kind === "note").length,
      files: saves.filter((s) => s.kind === "file" || s.kind === "scribble").length,
    }),
    [saves]
  );

  const openSave = openId ? saves.find((s) => s.id === openId) : undefined;
  const linkShare = linkId ? shares.find((s) => s.id === linkId) : undefined;

  /* ---------- toast timer ---------- */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error ? 5000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ---------- saving: optimistic, then persisted ---------- */
  async function persist(save: Save) {
    inflight.current++;
    try {
      let outgoing: NewSave & { file?: File } = save;
      if (save.file) {
        const file = await prepareFile(save.file);
        if (file !== save.file) outgoing = { ...save, file, preview: URL.createObjectURL(file) };
      }

      const remoteId = await createNote(outgoing, save.tags);

      if (cancelled.current.has(save.id)) {
        // the user hit Undo while it was uploading
        cancelled.current.delete(save.id);
        await deleteNote(remoteId).catch(() => {});
        return;
      }

      setSaves((prev) =>
        prev.map((s) =>
          s.id === save.id
            ? { ...s, remoteId, pending: false, file: outgoing.file, preview: outgoing.preview ?? s.preview }
            : s
        )
      );
    } catch (err) {
      setSaves((prev) => prev.filter((s) => s.id !== save.id));
      if (cancelled.current.delete(save.id)) return; // already undone, no need to complain
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      showToast({ message: errorMessage(err), error: true });
    } finally {
      inflight.current--;
    }
  }

  function addSaves(items: NewSave[], extra: string[] = []) {
    const created: Save[] = items.map((i) => ({
      ...i,
      id: uid(),
      ago: "Just now",
      createdAt: new Date().toISOString(),
      pending: true,
      tags: Array.from(new Set([...autoTags({ kind: i.kind, meta: i.meta }), ...extra])),
    }));

    setSaves((prev) => [...created, ...prev]);
    setFeedReset((n) => n + 1); // clear search and filters so the new save is visible
    showToast({
      ids: created.map((c) => c.id),
      message: created.length > 1 ? `Saved ${created.length} items` : `Saved to ${extra[0] ?? created[0].tags[0]}`,
    });
    navigator.vibrate?.(10);

    created.forEach(persist);
  }

  function undo() {
    if (!toast?.ids) return;
    const ids = toast.ids;
    const removed = saves.filter((s) => ids.includes(s.id));

    setSaves((prev) => prev.filter((s) => !ids.includes(s.id)));
    setToast(null);

    for (const s of removed) {
      if (s.remoteId) {
        deleteNote(s.remoteId).catch(() => showToast({ message: "Couldn't undo that save", error: true }));
      } else {
        cancelled.current.add(s.id); // still uploading: delete it when the server answers
      }
    }
  }

  /* ---------- editing, pinning, keeping and deleting ---------- */
  async function editSave(id: string, edits: Edits) {
    const before = saves.find((s) => s.id === id);
    if (!before?.remoteId) return;

    const next: Save = { ...before };
    const patch: { title?: string; content?: string; tags?: string[] } = {};

    if (before.kind === "note" && edits.content !== undefined) {
      next.content = edits.content;
      next.title = edits.content.length > 80 ? `${edits.content.slice(0, 80)}…` : edits.content;
      patch.content = edits.content;
    }
    if ((before.kind === "link" || before.kind === "social") && edits.title !== undefined) {
      next.title = edits.title;
      patch.title = edits.title;
    }
    if ((before.kind === "file" || before.kind === "scribble") && edits.note !== undefined) {
      next.note = edits.note || undefined;
      patch.content = edits.note;
    }
    if (edits.tags) {
      next.tags = Array.from(new Set([...autoTags(before), ...edits.tags]));
      patch.tags = storedTags(next.tags);
    }
    if (Object.keys(patch).length === 0) return;

    setSaves((prev) => prev.map((s) => (s.id === id ? next : s))); // show it right away
    try {
      await updateNote(before.remoteId, patch);
    } catch (err) {
      setSaves((prev) => prev.map((s) => (s.id === id ? before : s))); // put it back
      showToast({ message: errorMessage(err), error: true });
    }
  }

  async function togglePin(id: string) {
    const before = saves.find((s) => s.id === id);
    if (!before?.remoteId) return;
    const pinned = !before.pinned;

    setSaves((prev) => prev.map((s) => (s.id === id ? withPin(s, pinned) : s)));
    try {
      await updateNote(before.remoteId, { pinned });
    } catch (err) {
      setSaves((prev) => prev.map((s) => (s.id === id ? before : s)));
      showToast({ message: errorMessage(err), error: true });
    }
  }

  async function keepSave(id: string) {
    const before = saves.find((s) => s.id === id);
    if (!before?.remoteId) return;

    setSaves((prev) => prev.map((s) => (s.id === id ? { ...s, inbox: false } : s)));
    try {
      await updateNote(before.remoteId, { inbox: false });
      showToast({ message: "Kept in your library" });
    } catch (err) {
      setSaves((prev) => prev.map((s) => (s.id === id ? before : s)));
      showToast({ message: errorMessage(err), error: true });
    }
  }

  async function keepAll() {
    const targets = saves.filter((s) => s.inbox && s.remoteId);
    if (targets.length === 0) return;
    const ids = new Set(targets.map((t) => t.id));

    setSaves((prev) => prev.map((s) => (ids.has(s.id) ? { ...s, inbox: false } : s)));
    const results = await Promise.allSettled(targets.map((t) => updateNote(t.remoteId!, { inbox: false })));
    const failed = new Set(targets.filter((_, i) => results[i].status === "rejected").map((t) => t.id));

    if (failed.size) {
      setSaves((prev) => prev.map((s) => (failed.has(s.id) ? { ...s, inbox: true } : s)));
      showToast({ message: `Couldn't move ${failed.size} of ${targets.length} items`, error: true });
    } else {
      showToast({ message: `Kept ${targets.length} items` });
    }
  }

  async function deleteSave(id: string, label = "Deleted") {
    const index = saves.findIndex((s) => s.id === id);
    const target = saves[index];
    if (!target?.remoteId) return;

    setOpenId(null);
    setSaves((prev) => prev.filter((s) => s.id !== id));
    setShares((prev) => prev.filter((sh) => sh.note_id !== target.remoteId)); // their links die with them
    try {
      await deleteNote(target.remoteId);
      showToast({ message: label });
    } catch (err) {
      setSaves((prev) => {
        const copy = [...prev];
        copy.splice(Math.min(index, copy.length), 0, target); // back where it was
        return copy;
      });
      loadShares();
      showToast({ message: errorMessage(err), error: true });
    }
  }

  /* ---------- share links ---------- */
  async function makeShare(input: { scope: Share["scope"]; tag?: string; noteId?: string; title?: string }) {
    setSharing(true);
    try {
      const share = await createShare(input);
      setShares((prev) => (prev.some((s) => s.id === share.id) ? prev : [share, ...prev]));
      setShareNewOpen(false);
      setOpenId(null);
      setLinkId(share.id); // opens the "Link ready" sheet, where Copy and Share get a fresh tap
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      showToast({ message: errorMessage(err), error: true });
    } finally {
      setSharing(false);
    }
  }

  function shareItem(id: string) {
    const save = saves.find((s) => s.id === id);
    if (!save?.remoteId) {
      showToast({ message: "Still saving. Try again in a moment.", error: true });
      return;
    }
    makeShare({ scope: "item", noteId: save.remoteId, title: save.note ?? save.title });
  }

  async function stopSharing(id: string) {
    const before = shares;
    setShares((prev) => prev.filter((s) => s.id !== id));
    setLinkId(null);
    try {
      await deleteShare(id);
      showToast({ message: "Link stopped. It no longer works." });
    } catch (err) {
      setShares(before);
      showToast({ message: errorMessage(err), error: true });
    }
  }

  async function copyShare(id: string) {
    const share = shares.find((s) => s.id === id);
    if (!share) return;
    try {
      await copyLink(shareUrl(share.token));
      showToast({ message: "Link copied" });
    } catch {
      showToast({ message: "Couldn't copy. Open the link and copy it from there.", error: true });
    }
  }

  /* ---------- pages ---------- */
  const home = (
    <div className="mx-auto min-h-full w-full max-w-[430px] pb-44">
      <Header initial={initial} onAccount={openAccount} />

      <Composer
        open={composing}
        onOpenChange={setComposing}
        onSave={addSaves}
        tagSuggestions={customTags}
        enabled={active === 0}
      />

      <section className="mt-9 px-5">
        <h2 className="font-script text-[46px] leading-none">Your Lib</h2>
        <Feed
          items={library}
          resetKey={feedReset}
          loading={loading}
          loadError={loadError}
          onRetry={retry}
          onOpen={setOpenId}
          empty={
            <div className="rounded-[28px] border border-white/[0.07] bg-[var(--surface)] px-6 py-14 text-center text-[15px] leading-6 text-[var(--muted)]">
              Nothing here yet.
              <br />
              Paste a link, drop a file, or scribble something.
            </div>
          }
        />
      </section>
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
      <Pager
        pos={pos}
        active={active}
        enabled={!composing}
        goTo={goTo}
        stop={stop}
        pages={[
          { scroll: true, node: home },
          {
            scroll: false,
            node: (
              <ScribblePad
                key={padKey}
                active={active === 1}
                onClose={() => goTo(0)}
                onSave={(items, extra) => {
                  addSaves(items, extra);
                  goTo(0);
                  setTimeout(() => setPadKey((k) => k + 1), 600); // clear the pad once it has slid away
                }}
              />
            ),
          },
          {
            scroll: true,
            node: (
              <InboxPage
                items={inboxItems}
                loading={loading}
                loadError={loadError}
                resetKey={feedReset}
                initial={initial}
                onRetry={retry}
                onAccount={openAccount}
                onOpen={setOpenId}
                onKeep={keepSave}
                onKeepAll={keepAll}
                onHelp={() => setSetupOpen(true)}
              />
            ),
          },
          {
            scroll: true,
            node: (
              <SharePage
                shares={shares}
                loading={sharesLoading}
                error={sharesError}
                initial={initial}
                onAccount={openAccount}
                onNew={() => setShareNewOpen(true)}
                onOpen={setLinkId}
                onCopy={copyShare}
                onRetry={retryShares}
              />
            ),
          },
        ]}
      />

      <AnimatePresence>
        {openSave && (
          <DetailSheet
            key="detail"
            save={openSave}
            tagSuggestions={customTags}
            onClose={() => setOpenId(null)}
            onEdit={editSave}
            onDelete={deleteSave}
            onPin={togglePin}
            onKeep={keepSave}
            onShare={shareItem}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shareNewOpen && (
          <ShareNewSheet
            key="share-new"
            options={shareOptions}
            busy={sharing}
            onPick={(o) => makeShare({ scope: o.scope, tag: o.tag, title: o.scope === "all" ? "Everything" : o.tag })}
            onClose={() => setShareNewOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {linkShare && (
          <ShareLinkSheet key="share-link" share={linkShare} onStop={stopSharing} onClose={() => setLinkId(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {accountOpen && (
          <AccountSheet
            key="account"
            email={user.email}
            createdAt={user.createdAt}
            stats={stats}
            onClose={() => setAccountOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {setupOpen && <ShareSetupSheet key="setup" onClose={() => setSetupOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.key}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={SPRING}
            className="glass fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),12px)+88px)] z-[60] mx-auto flex w-[calc(100%-32px)] max-w-[398px] items-center justify-between gap-2 rounded-2xl py-2.5 pl-4 pr-2.5 text-[15px]"
          >
            <span className="flex min-w-0 items-center gap-2">
              {toast.error && <CircleAlert size={18} className="shrink-0 text-[#ff8a7a]" />}
              <span className={toast.error ? "line-clamp-2" : ""}>{toast.message}</span>
            </span>
            {toast.ids && (
              <button
                onClick={undo}
                className="rounded-xl px-3 py-1.5 font-semibold text-[var(--accent)] active:bg-white/10"
              >
                Undo
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <TabBar pos={pos} active={active} onSelect={goTo} inboxCount={inboxItems.length} />
    </MotionConfig>
  );
}