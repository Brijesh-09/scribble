"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
  Camera,
  ClipboardPaste,
  Download,
  FileText,
  ImagePlus,
  Mic,
  MonitorUp,
  Paperclip,
  Plus,
  X,
} from "lucide-react";
import { cleanTag, fromFile, fromText, SYSTEM_TAGS, uid, type NewSave } from "@/libs/saves";

export const SPRING = { type: "spring", bounce: 0, duration: 0.45 } as const;

/* ---------- speech-to-text (Web Speech API) ---------- */

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult:
    | ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getRecognition(): (new () => Recognition) | undefined {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

// hydration-safe feature detection (false on the server, real value on the client)
const noopSubscribe = () => () => {};
const hasDictation = () => typeof window !== "undefined" && !!getRecognition();
const hasScreenCapture = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

/* ---------- component ---------- */

type Staged = { id: string; file: File; url?: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (items: NewSave[], extraTags?: string[]) => void;
  tagSuggestions: string[];
  enabled?: boolean; // false while the scribble pad is on screen
};

export function Composer({ open, onOpenChange, onSave, tagSuggestions, enabled = true }: Props) {
  const [text, setText] = useState("");
  const [staged, setStaged] = useState<Staged[]>([]);
  const [dragging, setDragging] = useState(false);
  const [listening, setListening] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  const canDictate = useSyncExternalStore(noopSubscribe, hasDictation, () => false);
  const canCapture = useSyncExternalStore(noopSubscribe, hasScreenCapture, () => false);

  const recRef = useRef<Recognition | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* --- staging attachments --- */
  const stage = useCallback((files: File[]) => {
    if (!files.length) return;
    setStaged((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: uid(),
        file,
        url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      })),
    ]);
  }, []);

  function unstage(id: string) {
    const item = staged.find((s) => s.id === id);
    if (item?.url) URL.revokeObjectURL(item.url);
    setStaged((prev) => prev.filter((s) => s.id !== id));
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    stage(Array.from(e.target.files ?? []));
    e.target.value = ""; // allow picking the same file again
  }

  /* --- tags --- */
  function addTag() {
    const t = cleanTag(newTag, [...SYSTEM_TAGS, ...tagSuggestions, ...picked]);
    setNewTag("");
    if (t && !picked.includes(t)) setPicked((p) => [...p, t]);
  }

  /* --- global drop + paste: works without opening the composer --- */
  useEffect(() => {
    if (!enabled) return;
    let depth = 0;

    const hasPayload = (e: DragEvent) => {
      const t = e.dataTransfer?.types;
      return !!t && (t.includes("Files") || t.includes("text/plain") || t.includes("text/uri-list"));
    };
    const ingestFiles = (files: File[]) => {
      if (open) stage(files);
      else onSave(files.map((f) => fromFile(f)));
    };
    const ingestText = (t: string) => {
      if (!t.trim()) return;
      if (open) setText((p) => (p ? `${p}\n${t}` : t));
      else onSave([fromText(t)]);
    };

    const onEnter = (e: DragEvent) => {
      if (!hasPayload(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasPayload(e)) e.preventDefault(); // required to allow a drop
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasPayload(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) ingestFiles(files);
      else ingestText(e.dataTransfer?.getData("text/plain") ?? "");
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        ingestFiles(files);
        return;
      }
      if (!open) {
        const t = e.clipboardData?.getData("text/plain") ?? "";
        if (t.trim()) {
          e.preventDefault();
          ingestText(t);
        }
      } // when open, normal text paste goes into the textarea
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, [open, onSave, stage, enabled]);

  /* --- Escape closes; closing stops the mic --- */
  useEffect(() => {
    if (!open) {
      recRef.current?.stop();
      return;
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  /* --- dictation --- */
  function toggleDictation() {
    if (recRef.current) {
      recRef.current.stop(); // flushes the last words, then onend cleans up
      return;
    }
    const Ctor = getRecognition();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = navigator.language || "en-IN";
    rec.continuous = true;
    rec.interimResults = true;

    const base = text && !/\s$/.test(text) ? `${text} ` : text;
    let finalText = "";

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setText(base + finalText + interim); // live, as you speak
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    rec.onerror = () => {
      recRef.current = null;
      setListening(false);
    };

    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  /* --- clipboard button (text or image) --- */
  async function pasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      const images: File[] = [];
      let pasted = "";
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith("image/"));
        if (imgType) {
          const blob = await item.getType(imgType);
          images.push(new File([blob], `pasted-${Date.now()}.${imgType.split("/")[1]}`, { type: imgType }));
        } else if (item.types.includes("text/plain")) {
          pasted += await (await item.getType("text/plain")).text();
        }
      }
      stage(images);
      if (pasted) setText((p) => (p ? `${p}\n${pasted}` : pasted));
    } catch {
      try {
        const t = await navigator.clipboard.readText();
        if (t) setText((p) => (p ? `${p}\n${t}` : t));
      } catch {
        /* clipboard permission denied */
      }
    }
  }

  /* --- screen capture (desktop browsers) --- */
  async function captureScreen() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((r) => requestAnimationFrame(r));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (blob) stage([new File([blob], `screenshot-${Date.now()}.png`, { type: "image/png" })]);
    } catch {
      /* user cancelled the picker */
    }
  }

  /* --- save --- */
  function saveAll() {
    const note = text.trim();
    if (!staged.length && !note) return;

    // stop the mic without letting a late result refill the box
    if (recRef.current) {
      recRef.current.onresult = null;
      recRef.current.onend = null;
      recRef.current.stop();
      recRef.current = null;
      setListening(false);
    }

    // a tag typed but not confirmed yet still counts
    const pending = cleanTag(newTag, [...SYSTEM_TAGS, ...tagSuggestions, ...picked]);
    const tags = pending && !picked.includes(pending) ? [...picked, pending] : picked;

    if (staged.length) {
      // the text becomes the note on every attachment
      onSave(staged.map((s) => fromFile(s.file, { note, preview: s.url })), tags);
    } else {
      onSave([fromText(note)], tags);
    }
    setText("");
    setStaged([]);
    setPicked([]);
    setNewTag("");
    onOpenChange(false);
  }

  const canSave = !!text.trim() || staged.length > 0;

  return (
    <>
      <div className="mt-7 px-5">
        {open ? (
          <div className="h-[104px]" /> // keeps the page from jumping while the sheet is open
        ) : (
          <motion.button
            layoutId="composer"
            style={{ borderRadius: 28 }}
            transition={SPRING}
            whileTap={{ scale: 0.97 }}
            onClick={() => onOpenChange(true)}
            className="flex h-[104px] w-full items-center justify-center gap-3 border border-dashed border-white/15 bg-[var(--surface)] text-[16px] font-medium text-[var(--muted)]"
          >
            <span className="grid size-10 place-items-center rounded-full bg-white/[0.08] text-[var(--text)]">
              <Plus size={22} strokeWidth={1.75} />
            </span>
            Paste, write or attach
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="scrim"
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
          />
        )}
        {open && (
          <div
            key="sheet"
            className="pointer-events-none fixed inset-x-0 top-0 z-50 mx-auto max-w-[430px] px-3 pt-[max(env(safe-area-inset-top),12px)]"
          >
            <motion.div
              layoutId="composer"
              style={{ borderRadius: 28 }}
              transition={SPRING}
              className="glass-thick pointer-events-auto p-4 shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.12 } }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
              >
                <textarea
                  autoFocus
                  rows={3}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && saveAll()}
                  placeholder={staged.length ? "Add a note so you remember why…" : "Paste a link or write a note…"}
                  className="w-full resize-none bg-transparent text-[17px] leading-6 tracking-[-0.01em] outline-none placeholder:text-[var(--muted)]"
                />

                {staged.length > 0 && (
                  <div className="no-scrollbar -mx-1 mb-3 mt-1 flex gap-2.5 overflow-x-auto px-1 pt-1.5">
                    {staged.map((s) => (
                      <motion.div
                        key={s.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={SPRING}
                        className="relative shrink-0"
                      >
                        {s.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.url} alt="" className="size-16 rounded-2xl object-cover" />
                        ) : (
                          <div className="flex size-16 flex-col items-center justify-center gap-1 rounded-2xl bg-white/[0.08] px-1.5">
                            <FileText size={20} strokeWidth={1.75} />
                            <span className="w-full truncate text-center text-[10px] text-[var(--muted)]">
                              {s.file.name}
                            </span>
                          </div>
                        )}
                        <button
                          aria-label={`Remove ${s.file.name}`}
                          onClick={() => unstage(s.id)}
                          className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-[var(--text)] text-[var(--bg)]"
                        >
                          <X size={12} strokeWidth={2.5} />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* tags: pick existing ones or type a new one */}
                <div className="no-scrollbar -mx-1 mb-3 flex items-center gap-2 overflow-x-auto px-1">
                  {[...new Set([...tagSuggestions, ...picked])].map((t) => {
                    const on = picked.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setPicked((p) => (on ? p.filter((x) => x !== t) : [...p, t]))}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium ${
                          on ? "bg-[var(--text)] text-[var(--bg)]" : "bg-white/[0.08] text-[var(--muted)]"
                        }`}
                      >
                        #{t}
                      </button>
                    );
                  })}
                  <input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    onBlur={addTag}
                    enterKeyHint="done"
                    placeholder="+ Add tag"
                    className="w-24 shrink-0 bg-transparent px-2 py-1.5 text-[16px] outline-none placeholder:text-[var(--muted)]"
                  />
                </div>

                {/* hidden inputs */}
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
                <input ref={photoRef} type="file" accept="image/*" multiple hidden onChange={pick} />
                <input ref={fileRef} type="file" multiple hidden onChange={pick} />

                <div className="mt-2 flex items-center gap-2">
                  <Tool label="Take a photo" onClick={() => cameraRef.current?.click()}>
                    <Camera size={19} strokeWidth={1.75} />
                  </Tool>
                  <Tool label="Add photos or screenshots" onClick={() => photoRef.current?.click()}>
                    <ImagePlus size={19} strokeWidth={1.75} />
                  </Tool>
                  <Tool label="Attach files" onClick={() => fileRef.current?.click()}>
                    <Paperclip size={19} strokeWidth={1.75} />
                  </Tool>
                  <Tool label="Paste from clipboard" onClick={pasteFromClipboard}>
                    <ClipboardPaste size={19} strokeWidth={1.75} />
                  </Tool>
                  {canDictate && (
                    <Tool label={listening ? "Stop dictation" : "Dictate"} onClick={toggleDictation} active={listening}>
                      <Mic size={19} strokeWidth={1.75} />
                    </Tool>
                  )}
                  {canCapture && (
                    <Tool label="Capture screen" onClick={captureScreen}>
                      <MonitorUp size={19} strokeWidth={1.75} />
                    </Tool>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    aria-label="Save"
                    disabled={!canSave}
                    onClick={saveAll}
                    className="ml-auto grid size-10 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--bg)] disabled:opacity-30"
                  >
                    <ArrowUp size={20} strokeWidth={2.25} />
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* full-screen drop target: appears whenever something is dragged over the page */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            key="drop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              transition={SPRING}
              className="flex flex-col items-center gap-3 rounded-[32px] border-2 border-dashed border-[var(--accent)] px-12 py-14 text-center"
            >
              <Download size={30} strokeWidth={1.75} className="text-[var(--accent)]" />
              <p className="text-[19px] font-semibold tracking-[-0.02em]">
                {open ? "Drop to add to this note" : "Drop to save"}
              </p>
              <p className="text-[14px] text-[var(--muted)]">Links, text, images and files</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Tool({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      aria-label={label}
      onClick={onClick}
      className={`grid size-10 shrink-0 place-items-center rounded-full ${
        active ? "animate-pulse bg-[var(--accent)] text-[var(--bg)]" : "bg-white/[0.08]"
      }`}
    >
      {children}
    </motion.button>
  );
}