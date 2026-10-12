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
import { TagFilter } from "@/app/components/TagFilter";
import { SaveRow, type TileSize } from "@/app/components/SaveRow";
import { ScribblePad } from "@/app/components/Scribblepad";
import { TabBar } from "@/app/components/TabBar";
import { Pager } from "@/app/components/Pager";
import { DetailSheet, type Edits } from "@/app/components/DetailSheet";
import { AccountSheet } from "@/app/components/AccountSheet";
import { ALL, KIND_TAG, SYSTEM_TAGS, uid, type NewSave, type Save } from "@/libs/saves";
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

type Toast = { key: string; message: string; ids?: string[]; error?: boolean };
type User = { email: string; createdAt: string };

const SOON = {
  inbox: { title: "Inbox", body: "Things you share to Scribble from other apps will land here first." },
  share: { title: "Share", body: "Send a collection to someone with a single link." },
} as const;

const SKELETON: TileSize[] = ["s", "s", "w", "s", "s"];
const SPAN = { s: "", w: "col-span-2", t: "row-span-2", l: "col-span-2 row-span-2" } as const;

function SoonPage({
  which,
  initial,
  onAccount,
}: {
  which: keyof typeof SOON;
  initial?: string;
  onAccount: () => void;
}) {
  return (
    <div className="mx-auto min-h-full w-full max-w-[430px] pb-44">
      <Header initial={initial} onAccount={onAccount} />
      <section className="mt-24 px-8 text-center">
        <h2 className="font-script text-[36px] leading-none">{SOON[which].title}</h2>
        <p className="mt-3 text-[15px] leading-6 text-[var(--muted)]">{SOON[which].body}</p>
      </section>
    </div>
  );
}

export default function ScribbleApp({ user }: { user: User }) {
  const [saves, setSaves] = useState<Save[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState(ALL);
  const [composing, setComposing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
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

  useEffect(() => {
    load();
  }, [load]);

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

  /* ---------- derived: tags, filter, bento sizes, stats ---------- */
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of saves) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    const system = SYSTEM_TAGS.filter((t) => counts.has(t));
    const custom = [...counts.keys()]
      .filter((t) => !SYSTEM_TAGS.includes(t))
      .sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
    return { all: [ALL, ...system, ...custom], custom };
  }, [saves]);

  const activeFilter = tags.all.includes(filter) ? filter : ALL;

  const visible = useMemo(
    () => (activeFilter === ALL ? saves : saves.filter((s) => s.tags.includes(activeFilter))),
    [saves, activeFilter]
  );

  // first image is the hero, later images alternate tall/wide, long notes go wide
  const tiles = useMemo(() => {
    let images = 0;
    return visible.map((save) => {
      let size: TileSize = "s";
      if (save.preview) {
        size = images === 0 ? "l" : images % 2 === 1 ? "t" : "w";
        images++;
      } else if (save.kind === "note" && save.title.length > 30) {
        size = "w";
      }
      return { save, size };
    });
  }, [visible]);

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
      tags: Array.from(new Set([KIND_TAG[i.kind], ...extra])),
    }));

    setSaves((prev) => [...created, ...prev]);
    if (activeFilter !== ALL && !created.every((c) => c.tags.includes(activeFilter))) setFilter(ALL);
    showToast({
      ids: created.map((c) => c.id),
      message:
        created.length > 1 ? `Saved ${created.length} items` : `Saved to ${extra[0] ?? KIND_TAG[created[0].kind]}`,
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

  /* ---------- editing and deleting a save ---------- */
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
      next.tags = Array.from(new Set([KIND_TAG[before.kind], ...edits.tags]));
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

  async function deleteSave(id: string) {
    const index = saves.findIndex((s) => s.id === id);
    const target = saves[index];
    if (!target?.remoteId) return;

    setOpenId(null);
    setSaves((prev) => prev.filter((s) => s.id !== id));
    try {
      await deleteNote(target.remoteId);
      showToast({ message: "Deleted" });
    } catch (err) {
      setSaves((prev) => {
        const copy = [...prev];
        copy.splice(Math.min(index, copy.length), 0, target); // back where it was
        return copy;
      });
      showToast({ message: errorMessage(err), error: true });
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
        tagSuggestions={tags.custom}
        enabled={active === 0}
      />

      <section className="mt-9 px-5">
        <h2 className="font-script text-[34px] leading-none">Your Lib</h2>
        <div className="mt-3">
          <TagFilter tags={tags.all} value={activeFilter} onChange={setFilter} />
        </div>

        {loading ? (
          <ul className="mt-4 grid auto-rows-[128px] grid-flow-dense grid-cols-2 gap-3" aria-busy>
            {SKELETON.map((size, i) => (
              <li key={i} className={`${SPAN[size]} animate-pulse rounded-[24px] bg-white/[0.05]`} />
            ))}
          </ul>
        ) : loadError && saves.length === 0 ? (
          <div className="mt-4 rounded-[28px] border border-white/[0.07] bg-[var(--surface)] px-6 py-12 text-center">
            <p className="text-[15px] text-[var(--muted)]">{loadError}</p>
            <button
              onClick={() => {
                setLoading(true);
                load();
              }}
              className="mt-4 rounded-full bg-[var(--text)] px-5 py-2 text-[15px] font-semibold text-[var(--bg)] active:scale-95"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <ul className="mt-4 grid auto-rows-[128px] grid-flow-dense grid-cols-2 gap-3">
              <AnimatePresence initial={false}>
                {tiles.map(({ save, size }) => (
                  <SaveRow key={save.id} save={save} size={size} onOpen={setOpenId} />
                ))}
              </AnimatePresence>
            </ul>

            {visible.length === 0 && (
              <div className="mt-4 rounded-[28px] border border-white/[0.07] bg-[var(--surface)] px-6 py-14 text-center text-[15px] leading-6 text-[var(--muted)]">
                Nothing here yet.
                <br />
                Paste a link, drop a file, or scribble something.
              </div>
            )}
          </>
        )}
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
          { scroll: true, node: <SoonPage which="inbox" initial={initial} onAccount={openAccount} /> },
          { scroll: true, node: <SoonPage which="share" initial={initial} onAccount={openAccount} /> },
        ]}
      />

      <AnimatePresence>
        {openSave && (
          <DetailSheet
            key="detail"
            save={openSave}
            tagSuggestions={tags.custom}
            onClose={() => setOpenId(null)}
            onEdit={editSave}
            onDelete={deleteSave}
          />
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

      <TabBar pos={pos} active={active} onSelect={goTo} />
    </MotionConfig>
  );
}