"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpDown, Check, Search, X } from "lucide-react";
import { TagFilter } from "./TagFilter";
import { SaveRow, type TileSize } from "./SaveRow";
import { SPRING } from "./Composer";
import { ALL, deriveTags, type Save } from "@/libs/saves";

type SortKey = "new" | "old" | "az";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "new", label: "Newest first" },
  { key: "old", label: "Oldest first" },
  { key: "az", label: "A to Z" },
];

const SKELETON: TileSize[] = ["s", "s", "w", "s", "s"];
const SPAN = { s: "", w: "col-span-2", t: "row-span-2", l: "col-span-2 row-span-2" } as const;

type Props = {
  items: Save[];
  resetKey: number; // change it to clear search and filter (after a new save, so it can't be hidden)
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onKeep?: (id: string) => void; // Inbox: adds a one-tap keep button to every tile
  empty: ReactNode; // shown when there is nothing at all
};

export function Feed({ items, resetKey, loading, loadError, onRetry, onOpen, onKeep, empty }: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("new");
  const [filter, setFilter] = useState(ALL);
  const [sortOpen, setSortOpen] = useState(false);

  // reset during render when the parent asks (the supported way to derive state from props)
  const [seen, setSeen] = useState(resetKey);
  if (seen !== resetKey) {
    setSeen(resetKey);
    setQuery("");
    setFilter(ALL);
  }

  const tags = useMemo(() => deriveTags(items), [items]);
  const activeFilter = tags.all.includes(filter) ? filter : ALL;

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = activeFilter === ALL ? items : items.filter((s) => s.tags.includes(activeFilter));
    if (q) {
      out = out.filter((s) =>
        [s.title, s.note, s.content, s.description, s.meta, s.tags.join(" ")].some((f) => f?.toLowerCase().includes(q))
      );
    }

    const time = (s: Save) => (s.createdAt ? Date.parse(s.createdAt) : 0);
    const by: (a: Save, b: Save) => number =
      sort === "az"
        ? (a, b) => (a.note ?? a.title).localeCompare(b.note ?? b.title, undefined, { sensitivity: "base" })
        : sort === "old"
          ? (a, b) => time(a) - time(b)
          : (a, b) => time(b) - time(a);

    // pinned always first, then your chosen order
    return [...out].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || by(a, b));
  }, [items, activeFilter, query, sort]);

  // first image is the hero, later images alternate tall/wide, long notes go wide
  const tiles = useMemo(() => {
    let images = 0;
    return list.map((save) => {
      let size: TileSize = "s";
      if (save.preview) {
        size = images === 0 ? "l" : images % 2 === 1 ? "t" : "w";
        images++;
      } else if (save.kind === "note" && save.title.length > 30) {
        size = "w";
      }
      return { save, size };
    });
  }, [list]);

  return (
    <div>
      {/* search + sort */}
      <div className="mt-3 flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-white/[0.07] px-3.5 py-2.5">
          <Search size={17} strokeWidth={1.9} className="shrink-0 text-[var(--muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-[var(--muted)]"
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery("")} className="shrink-0 text-[var(--muted)]">
              <X size={16} strokeWidth={2} />
            </button>
          )}
        </label>

        <div className="relative">
          <motion.button
            whileTap={{ scale: 0.92 }}
            aria-label="Sort"
            aria-expanded={sortOpen}
            onClick={() => setSortOpen((o) => !o)}
            className="grid size-11 place-items-center rounded-2xl bg-white/[0.07]"
          >
            <ArrowUpDown size={18} strokeWidth={1.9} />
          </motion.button>

          <AnimatePresence>
            {sortOpen && <div key="backdrop" className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />}
            {sortOpen && (
              <motion.div
                key="menu"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={SPRING}
                style={{ transformOrigin: "100% 0%", borderRadius: 20 }}
                className="glass-thick absolute right-0 top-[calc(100%+8px)] z-20 w-48 p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
              >
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => {
                      setSort(s.key);
                      setSortOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[15px] active:bg-white/10"
                  >
                    {s.label}
                    {sort === s.key && <Check size={16} strokeWidth={2.25} className="text-[var(--accent)]" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-3">
        <TagFilter tags={tags.all} value={activeFilter} onChange={setFilter} />
      </div>

      {loading ? (
        <ul className="mt-4 grid auto-rows-[128px] grid-flow-dense grid-cols-2 gap-3" aria-busy>
          {SKELETON.map((size, i) => (
            <li key={i} className={`${SPAN[size]} animate-pulse rounded-[24px] bg-white/[0.05]`} />
          ))}
        </ul>
      ) : loadError && items.length === 0 ? (
        <div className="mt-4 rounded-[28px] border border-white/[0.07] bg-[var(--surface)] px-6 py-12 text-center">
          <p className="text-[15px] text-[var(--muted)]">{loadError}</p>
          <button
            onClick={onRetry}
            className="mt-4 rounded-full bg-[var(--text)] px-5 py-2 text-[15px] font-semibold text-[var(--bg)] active:scale-95"
          >
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4">{empty}</div>
      ) : (
        <>
          <ul className="mt-4 grid auto-rows-[128px] grid-flow-dense grid-cols-2 gap-3">
            <AnimatePresence initial={false}>
              {tiles.map(({ save, size }) => (
                <SaveRow key={save.id} save={save} size={size} onOpen={onOpen} onKeep={onKeep} />
              ))}
            </AnimatePresence>
          </ul>

          {list.length === 0 && (
            <div className="mt-4 rounded-[28px] border border-white/[0.07] bg-[var(--surface)] px-6 py-12 text-center">
              <p className="text-[16px]">Nothing matches.</p>
              <button
                onClick={() => {
                  setQuery("");
                  setFilter(ALL);
                }}
                className="mt-3 rounded-full bg-white/[0.08] px-4 py-2 text-[14px] font-medium active:scale-95"
              >
                Clear search and filters
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}