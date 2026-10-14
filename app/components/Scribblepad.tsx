"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { animate, AnimatePresence, motion } from "motion/react";
import { getStroke } from "perfect-freehand";
import { ArrowUp, Eraser, Highlighter, LocateFixed, Pen, Redo2, Trash2, Undo2, X } from "lucide-react";
import { fromScribble, uid, type NewSave } from "@/libs/saves";
import { SPRING } from "./Composer";

type Tool = "pen" | "marker" | "eraser";
type Pt = [number, number, number]; // x, y (in canvas space), pressure
type Stroke = {
  id: string;
  tool: "pen" | "marker";
  color: string;
  size: number;
  points: Pt[];
  path: Path2D; // cached outline so redraws are cheap
};
type Doc = { strokes: Stroke[]; past: Stroke[][]; future: Stroke[][] };
type View = { x: number; y: number; k: number }; // pan offset in screen px, zoom factor

const COLORS = ["#f4eeeb", "#d9b8ae", "#ff8a7a", "#ffc46b", "#9bd8a5", "#8ec5ff"];
const SIZES = [3, 6, 10];
const MIN_K = 0.1;
const MAX_K = 8;
const TOOLS = [
  { key: "pen", label: "Pen", icon: Pen },
  { key: "marker", label: "Marker", icon: Highlighter },
  { key: "eraser", label: "Eraser", icon: Eraser },
] as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const widthOf = (tool: "pen" | "marker", size: number) => (tool === "marker" ? size * 2.6 : size);

/* ---- the "ink": perfect-freehand outline -> smooth Path2D ---- */
function buildPath(points: Pt[], tool: "pen" | "marker", size: number, realPressure: boolean, last: boolean) {
  const w = widthOf(tool, size);
  const outline =
    tool === "marker"
      ? getStroke(points, { size: w, thinning: 0, smoothing: 0.7, streamline: 0.6, simulatePressure: false, last })
      : getStroke(points, {
          size: w,
          thinning: 0.55, // faster = thinner, like a real nib
          smoothing: 0.6,
          streamline: 0.45,
          simulatePressure: !realPressure, // finger/mouse: fake it from velocity
          start: { taper: w * 1.5 },
          end: { taper: w * 3 },
          last,
        });

  const path = new Path2D();
  if (outline.length < 3) {
    path.arc(points[0][0], points[0][1], w / 2, 0, Math.PI * 2); // a tap = a dot
    return path;
  }
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  path.closePath();
  return path;
}

function paint(ctx: CanvasRenderingContext2D, s: { tool: "pen" | "marker"; color: string; path: Path2D }) {
  ctx.globalAlpha = s.tool === "marker" ? 0.4 : 1;
  ctx.fillStyle = s.color;
  ctx.fill(s.path);
  ctx.globalAlpha = 1;
}

function bounds(strokes: Stroke[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    const r = widthOf(s.tool, s.size) / 2;
    for (const [x, y] of s.points) {
      x0 = Math.min(x0, x - r);
      y0 = Math.min(y0, y - r);
      x1 = Math.max(x1, x + r);
      y1 = Math.max(y1, y + r);
    }
  }
  return { x0, y0, x1, y1 };
}

type Props = {
  onClose: () => void;
  onSave: (items: NewSave[], extraTags?: string[]) => void;
  active: boolean; // true while this page is the one on screen
};

export function ScribblePad({ onClose, onSave, active }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const doc = useRef<Doc>({ strokes: [], past: [], future: [] });
  const live = useRef<{
    pointerId: number;
    real: boolean;
    points: Pt[];
    tool: "pen" | "marker";
    color: string;
    size: number;
  } | null>(null);
  const erasing = useRef<{ pointerId: number; pushed: boolean } | null>(null);
  const frame = useRef(0);
  const dims = useRef({ w: 0, h: 0, dpr: 1 });
  const view = useRef<View>({ x: 0, y: 0, k: 1 });

  // navigating: two fingers (touch), middle button or Space+drag (mouse), wheel (trackpad)
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ d0: number; c0: { x: number; y: number }; v0: View } | null>(null);
  const mousePan = useRef<{ id: number; sx: number; sy: number; v0: View } | null>(null);
  const space = useRef(false);
  const fitAnim = useRef<ReturnType<typeof animate> | null>(null);

  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(1);
  const [inking, setInking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  /* ---- rendering: strokes live in canvas space, the view maps them to the screen ---- */
  const draw = useCallback(() => {
    frame.current = 0;
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const { dpr } = dims.current;
    const v = view.current;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * v.x, dpr * v.y);
    for (const s of doc.current.strokes) paint(ctx, s);
    const l = live.current;
    if (l) {
      paint(ctx, { tool: l.tool, color: l.color, path: buildPath(l.points, l.tool, l.size, l.real, false) });
    }

    // the dot grid pans and zooms with the drawing
    const wrap = wrapRef.current;
    if (wrap) {
      let step = 22;
      while (step * v.k < 14) step *= 2;
      wrap.style.backgroundSize = `${step * v.k}px ${step * v.k}px`;
      wrap.style.backgroundPosition = `${v.x}px ${v.y}px`;
    }
    if (labelRef.current) labelRef.current.textContent = `${Math.round(v.k * 100)}%`;
  }, []);

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const c = canvasRef.current;
    if (!wrap || !c) return;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      dims.current = { w, h, dpr };
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      draw();
    });
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [draw]);

  /* ---- wheel / trackpad: scroll pans, pinch (or Ctrl/⌘ + scroll) zooms at the cursor ---- */
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      fitAnim.current?.stop();
      const unit = e.deltaMode === 1 ? 16 : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const v = view.current;

      if (e.ctrlKey || e.metaKey) {
        const k = clamp(v.k * Math.exp(-dy * 0.01), MIN_K, MAX_K);
        const wx = (px - v.x) / v.k;
        const wy = (py - v.y) / v.k;
        view.current = { k, x: px - wx * k, y: py - wy * k };
      } else {
        view.current = { ...v, x: v.x - dx, y: v.y - dy };
      }
      schedule();
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [schedule]);

  /* ---- keys: Escape closes, Space + drag pans ---- */
  useEffect(() => {
    if (!active) return;
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (saving) setSaving(false);
        else onClose();
      } else if (e.code === "Space" && !typing(e.target)) {
        space.current = true;
        e.preventDefault();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      space.current = false;
    };
  }, [active, saving, onClose]);

  /* ---- history (snapshot based, so erasing is undoable too) ---- */
  const commit = (strokes: Stroke[]) => {
    const d = doc.current;
    doc.current = { strokes, past: [...d.past, d.strokes].slice(-50), future: [] };
    draw();
    rerender();
  };
  const undo = () => {
    const d = doc.current;
    if (!d.past.length) return;
    doc.current = { strokes: d.past[d.past.length - 1], past: d.past.slice(0, -1), future: [...d.future, d.strokes] };
    draw();
    rerender();
  };
  const redo = () => {
    const d = doc.current;
    if (!d.future.length) return;
    doc.current = { strokes: d.future[d.future.length - 1], past: [...d.past, d.strokes], future: d.future.slice(0, -1) };
    draw();
    rerender();
  };
  const clear = () => doc.current.strokes.length && commit([]);

  /* ---- coordinates ---- */
  type PE = { clientX: number; clientY: number; pressure: number };

  // position on the screen, relative to the canvas
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    // scale by rect so it stays accurate while the pad is still animating in
    return {
      x: (e.clientX - r.left) * (dims.current.w / r.width),
      y: (e.clientY - r.top) * (dims.current.h / r.height),
    };
  };

  // position in the drawing, which is what strokes are stored in
  const toWorld = (e: PE): Pt => {
    const p = local(e);
    const v = view.current;
    return [(p.x - v.x) / v.k, (p.y - v.y) / v.k, e.pressure || 0.5];
  };

  const coalesced = (e: React.PointerEvent): PE[] => {
    const list = e.nativeEvent.getCoalescedEvents?.();
    return list && list.length ? list : [e.nativeEvent];
  };

  /* ---- two-finger pan + pinch ---- */
  const startGesture = () => {
    const [a, b] = [...touches.current.values()];
    gesture.current = {
      d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      v0: { ...view.current },
    };
  };

  const updateGesture = () => {
    const g = gesture.current;
    if (!g || touches.current.size < 2) return;
    const [a, b] = [...touches.current.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const k = clamp((g.v0.k * d) / g.d0, MIN_K, MAX_K);
    // the point of the drawing that was between your fingers stays between your fingers
    const wx = (g.c0.x - g.v0.x) / g.v0.k;
    const wy = (g.c0.y - g.v0.y) / g.v0.k;
    view.current = { k, x: c.x - wx * k, y: c.y - wy * k };
    schedule();
  };

  const cancelStroke = () => {
    live.current = null;
    erasing.current = null;
    setInking(false);
    schedule();
  };

  /* ---- fit the drawing into view (or go back to 100%) ---- */
  function fitView() {
    const strokes = doc.current.strokes;
    const { w, h } = dims.current;
    let target: View = { x: 0, y: 0, k: 1 };
    if (strokes.length) {
      const { x0, y0, x1, y1 } = bounds(strokes);
      const k = clamp(Math.min((w - 96) / Math.max(x1 - x0, 1), (h - 280) / Math.max(y1 - y0, 1), 2), MIN_K, MAX_K);
      target = { k, x: w / 2 - ((x0 + x1) / 2) * k, y: (h - 110) / 2 - ((y0 + y1) / 2) * k };
    }
    const from = { ...view.current };
    fitAnim.current?.stop();
    fitAnim.current = animate(0, 1, {
      type: "spring",
      bounce: 0,
      duration: 0.45,
      onUpdate: (t) => {
        view.current = {
          k: from.k + (target.k - from.k) * t,
          x: from.x + (target.x - from.x) * t,
          y: from.y + (target.y - from.y) * t,
        };
        schedule();
      },
    });
  }

  /* ---- erasing ---- */
  const eraseAt = ([x, y]: Pt) => {
    const d = doc.current;
    const reach = 16 / view.current.k; // stays 16px on screen however far you've zoomed
    const keep = d.strokes.filter(
      (s) => !s.points.some(([px, py]) => Math.hypot(px - x, py - y) < reach + widthOf(s.tool, s.size) / 2)
    );
    if (keep.length === d.strokes.length) return;
    const e = erasing.current!;
    doc.current = { strokes: keep, past: e.pushed ? d.past : [...d.past, d.strokes], future: [] };
    e.pushed = true;
    draw();
    rerender();
  };

  /* ---- pointer input ---- */
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    fitAnim.current?.stop();

    if (e.pointerType === "mouse") {
      if (e.button === 1 || (e.button === 0 && space.current)) {
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = local(e);
        mousePan.current = { id: e.pointerId, sx: p.x, sy: p.y, v0: { ...view.current } };
        return;
      }
      if (e.button !== 0) return;
    }

    if (e.pointerType === "touch") {
      e.currentTarget.setPointerCapture(e.pointerId);
      touches.current.set(e.pointerId, local(e));
      if (touches.current.size === 2) {
        cancelStroke(); // the first finger was starting a gesture, not a stroke
        startGesture();
        return;
      }
      if (touches.current.size > 2) return;
    }

    if (live.current || erasing.current || gesture.current) return;
    if (e.pointerType !== "touch") e.currentTarget.setPointerCapture(e.pointerId);
    const p = toWorld(e);

    if (tool === "eraser") {
      erasing.current = { pointerId: e.pointerId, pushed: false };
      eraseAt(p);
      return;
    }
    live.current = {
      pointerId: e.pointerId,
      real: e.pointerType === "pen",
      points: [p],
      tool,
      color,
      size: SIZES[size],
    };
    setInking(true);
    schedule();
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === "touch" && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, local(e));
      if (gesture.current) {
        updateGesture();
        return;
      }
    }

    const mp = mousePan.current;
    if (mp && mp.id === e.pointerId) {
      const p = local(e);
      view.current = { ...mp.v0, x: mp.v0.x + (p.x - mp.sx), y: mp.v0.y + (p.y - mp.sy) };
      schedule();
      return;
    }

    if (erasing.current?.pointerId === e.pointerId) {
      for (const ev of coalesced(e)) eraseAt(toWorld(ev));
      return;
    }
    const l = live.current;
    if (!l || l.pointerId !== e.pointerId) return;
    for (const ev of coalesced(e)) l.points.push(toWorld(ev));
    schedule();
  }

  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === "touch") {
      touches.current.delete(e.pointerId);
      if (gesture.current) {
        if (touches.current.size < 2) gesture.current = null;
        return; // lifting a finger after a gesture never leaves a stroke behind
      }
    }
    if (mousePan.current?.id === e.pointerId) {
      mousePan.current = null;
      return;
    }
    if (erasing.current?.pointerId === e.pointerId) {
      erasing.current = null;
      return;
    }
    const l = live.current;
    if (!l || l.pointerId !== e.pointerId) return;
    live.current = null;
    const stroke: Stroke = {
      id: uid(),
      tool: l.tool,
      color: l.color,
      size: l.size,
      points: l.points,
      path: buildPath(l.points, l.tool, l.size, l.real, true),
    };
    commit([...doc.current.strokes, stroke]);
    setInking(false);
  }

  function cancel(e: React.PointerEvent<HTMLCanvasElement>) {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) gesture.current = null;
    if (mousePan.current?.id === e.pointerId) mousePan.current = null;
    cancelStroke();
  }

  /* ---- export: the whole drawing, cropped, on the app's dark paper ---- */
  async function exportFile(): Promise<File | null> {
    const strokes = doc.current.strokes;
    if (!strokes.length) return null;

    const { x0, y0, x1, y1 } = bounds(strokes);
    const w = Math.max(x1 - x0 + 64, 200);
    const h = Math.max(y1 - y0 + 64, 200);
    const ox = (x0 + x1) / 2 - w / 2;
    const oy = (y0 + y1) / 2 - h / 2;
    const scale = Math.min(2, 4096 / Math.max(w, h)); // a huge drawing still has to fit in a canvas

    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(w * scale));
    out.height = Math.max(1, Math.round(h * scale));
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#151516";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.scale(scale, scale);
    ctx.translate(-ox, -oy);
    for (const s of strokes) paint(ctx, s);

    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
    return blob ? new File([blob], `scribble-${Date.now()}.png`, { type: "image/png" }) : null;
  }

  async function confirmSave() {
    if (busy) return;
    setBusy(true);
    const file = await exportFile();
    if (!file) {
      setBusy(false);
      return;
    }
    onSave([fromScribble(file, note)]);
  }

  const d = doc.current;
  const empty = d.strokes.length === 0;

  return (
    <div
      ref={wrapRef}
      style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)" }}
      className="relative h-full w-full touch-none overscroll-none bg-[var(--bg)]"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full touch-none"
        style={{ cursor: tool === "eraser" ? "cell" : "crosshair" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* empty-state hint */}
      <AnimatePresence>
        {empty && !inking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 grid place-items-center text-center"
          >
            <div>
              <p className="font-script text-[48px] text-white/25">Scribble anything</p>
              <p className="mt-1 text-[14px] text-white/20">Pinch to zoom · two fingers to move</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto flex max-w-[430px] items-center justify-between px-3 pt-[max(env(safe-area-inset-top),12px)]">
        <Btn label="Close" onClick={onClose}>
          <X size={20} strokeWidth={1.75} />
        </Btn>

        <div className="glass pointer-events-auto flex gap-0.5 rounded-full p-1">
          <Btn plain label="Undo" disabled={!d.past.length} onClick={undo}>
            <Undo2 size={19} strokeWidth={1.75} />
          </Btn>
          <Btn plain label="Redo" disabled={!d.future.length} onClick={redo}>
            <Redo2 size={19} strokeWidth={1.75} />
          </Btn>
          <Btn plain label="Clear" disabled={empty} onClick={clear}>
            <Trash2 size={19} strokeWidth={1.75} />
          </Btn>
        </div>

        <Btn accent label="Save scribble" disabled={empty} onClick={() => setSaving(true)}>
          <ArrowUp size={20} strokeWidth={2.25} />
        </Btn>
      </div>

      {/* zoom level: tap to fit your drawing in view */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),12px)+124px)] mx-auto flex max-w-[430px] justify-end px-4">
        <button
          onClick={fitView}
          aria-label="Fit drawing to screen"
          className="glass pointer-events-auto flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-3.5 text-[13px] active:scale-95"
        >
          <LocateFixed size={15} strokeWidth={1.9} />
          <span ref={labelRef}>100%</span>
        </button>
      </div>

      {/* tool palette */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto max-w-[430px] px-4 pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="glass pointer-events-auto rounded-[28px] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between">
            <div role="radiogroup" aria-label="Tool" className="flex gap-1">
              {TOOLS.map(({ key, label, icon: Icon }) => {
                const on = tool === key;
                return (
                  <motion.button
                    key={key}
                    whileTap={{ scale: 0.92 }}
                    aria-label={label}
                    aria-pressed={on}
                    onClick={() => setTool(key)}
                    className={`relative grid size-11 place-items-center rounded-2xl ${
                      on ? "text-[var(--text)]" : "text-[var(--muted)]"
                    }`}
                  >
                    {on && (
                      <motion.span
                        layoutId="pad-tool"
                        transition={SPRING}
                        className="absolute inset-0 rounded-2xl bg-white/10"
                      />
                    )}
                    <Icon className="relative" size={22} strokeWidth={1.75} />
                  </motion.button>
                );
              })}
            </div>

            <div className="flex items-center gap-1" aria-label="Size">
              {SIZES.map((s, i) => (
                <motion.button
                  key={s}
                  whileTap={{ scale: 0.9 }}
                  aria-label={`Size ${i + 1}`}
                  onClick={() => setSize(i)}
                  className={`grid size-9 place-items-center rounded-full ${size === i ? "bg-white/10" : ""}`}
                >
                  <span className="rounded-full bg-[var(--text)]" style={{ width: s + 4, height: s + 4 }} />
                </motion.button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between px-1">
            {COLORS.map((c) => (
              <motion.button
                key={c}
                whileTap={{ scale: 0.88 }}
                aria-label={`Ink ${c}`}
                onClick={() => {
                  setColor(c);
                  if (tool === "eraser") setTool("pen");
                }}
                className={`size-8 rounded-full ${
                  color === c && tool !== "eraser" ? "ring-2 ring-white ring-offset-2 ring-offset-[#1e1e21]" : ""
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* save sheet: opens from the save button, with a note so you remember why */}
      <AnimatePresence>
        {saving && (
          <motion.div
            key="scrim"
            className="absolute inset-0 z-10 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSaving(false)}
          />
        )}
        {saving && (
          <div
            key="sheet"
            className="pointer-events-none absolute inset-x-0 top-0 z-20 mx-auto max-w-[430px] px-3 pt-[calc(max(env(safe-area-inset-top),12px)+52px)]"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={SPRING}
              style={{ transformOrigin: "100% 0%", borderRadius: 24 }}
              className="glass-thick pointer-events-auto p-3 shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            >
              <input
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmSave()}
                enterKeyHint="done"
                placeholder="Add a note to remember it (optional)"
                className="w-full bg-transparent px-1 py-2 text-[17px] tracking-[-0.01em] outline-none placeholder:text-[var(--muted)]"
              />
              <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={busy}
                onClick={confirmSave}
                className="mt-2 w-full rounded-2xl bg-[var(--accent)] py-3 text-[16px] font-semibold text-[var(--bg)] disabled:opacity-50"
              >
                Save scribble
              </motion.button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Btn({
  label,
  onClick,
  disabled,
  plain,
  accent,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  plain?: boolean;
  accent?: boolean;
  children: React.ReactNode;
}) {
  const look = accent ? "bg-[var(--accent)] text-[var(--bg)]" : plain ? "" : "glass";
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full disabled:opacity-30 ${look}`}
    >
      {children}
    </motion.button>
  );
}