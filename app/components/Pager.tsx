"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion, useTransform, type MotionValue } from "motion/react";

const EDGE = 24; // px: on the scribble page only a swipe from the screen edge navigates
const SLOP = 10; // px of movement before we decide what the gesture is
const SCRIBBLE = 1; // index of the full-screen drawing page

export type PagerPage = { node: ReactNode; scroll: boolean };

type Props = {
  pages: PagerPage[];
  pos: MotionValue<number>; // fractional page index, e.g. 1.4 = 40% of the way to page 2
  active: number;
  enabled: boolean;
  goTo: (index: number, velocity?: number) => void;
  stop: () => void;
};

// momentum projection: where the page would come to rest if it were thrown
const project = (v: number, d = 0.998) => ((v / 1000) * d) / (1 - d);

// the further past the end, the less the page follows the finger
function rubberband(over: number, dim: number, c = 0.55) {
  return (over * dim * c) / (dim + c * Math.abs(over));
}

export function Pager({ pages, pos, active, enabled, goTo, stop }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const g = useRef({
    mode: "idle" as "idle" | "pending" | "swiping",
    id: -1,
    startX: 0,
    startY: 0,
    pos0: 0,
    startIndex: 0,
    width: 1,
    samples: [] as { t: number; x: number }[],
    swiped: false,
  });

  // we own horizontal gestures, so switch off the browser's history swipe on desktop
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overscrollBehaviorX;
    el.style.overscrollBehaviorX = "none";
    return () => {
      el.style.overscrollBehaviorX = prev;
    };
  }, []);

  function down(e: React.PointerEvent<HTMLDivElement>) {
    const s = g.current;
    if (s.mode !== "idle") return; // ignore a second finger
    s.swiped = false;
    if (!enabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-no-swipe]")) return;

    const width = root.current!.clientWidth;
    const index = Math.round(pos.get());

    if (index === SCRIBBLE) {
      const edge = e.clientX < EDGE || e.clientX > width - EDGE;
      if (!edge) return; // that's drawing, not navigating
      e.stopPropagation(); // keep the canvas from starting a stroke
    }

    Object.assign(s, {
      mode: "pending",
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startIndex: index,
      width,
      samples: [{ t: e.timeStamp, x: e.clientX }],
    });
  }

  function move(e: React.PointerEvent<HTMLDivElement>) {
    const s = g.current;
    if (s.mode === "idle" || e.pointerId !== s.id) return;

    if (s.mode === "pending") {
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        s.mode = "idle"; // vertical: let the page scroll
        return;
      }
      // horizontal: take over. Grab the page wherever it is, even mid-animation.
      stop();
      s.mode = "swiping";
      s.swiped = true;
      s.pos0 = pos.get();
      s.startX = e.clientX; // track from here so the page doesn't jump by the slop
      s.samples = [{ t: e.timeStamp, x: e.clientX }];
      root.current!.setPointerCapture(e.pointerId);
      root.current!.style.userSelect = "none";
      return;
    }

    // swiping: 1:1 with the finger, resisting past the ends
    const last = pages.length - 1;
    let next = s.pos0 - (e.clientX - s.startX) / s.width;
    if (next < 0) next = -rubberband(-next * s.width, s.width) / s.width;
    else if (next > last) next = last + rubberband((next - last) * s.width, s.width) / s.width;
    pos.set(next);

    const a = s.samples;
    a.push({ t: e.timeStamp, x: e.clientX });
    while (a.length > 2 && e.timeStamp - a[0].t > 100) a.shift();
  }

  function end(e: React.PointerEvent<HTMLDivElement>, cancelled = false) {
    const s = g.current;
    if (e.pointerId !== s.id) return;

    if (s.mode === "swiping") {
      root.current!.style.userSelect = "";

      // finger velocity over the last ~100ms (zero if it paused before lifting)
      const a = s.samples;
      let v = 0;
      if (!cancelled && a.length >= 2 && e.timeStamp - a[a.length - 1].t < 80) {
        const dt = a[a.length - 1].t - a[0].t;
        if (dt > 0) v = ((a[a.length - 1].x - a[0].x) / dt) * 1000;
      }

      // settle where the page would land, but never skip more than one page
      const last = pages.length - 1;
      const projected = pos.get() - project(v) / s.width;
      const near = Math.max(s.startIndex - 1, Math.min(s.startIndex + 1, Math.round(projected)));
      goTo(Math.max(0, Math.min(last, near)), -v / s.width);
    }
    s.mode = "idle";
  }

  return (
    <div
      ref={root}
      className="fixed inset-0 overflow-hidden"
      onPointerDownCapture={down}
      onPointerMove={move}
      onPointerUp={(e) => end(e)}
      onPointerCancel={(e) => end(e, true)}
      onClickCapture={(e) => {
        // a swipe that began on a button shouldn't also tap it
        if (g.current.swiped) {
          e.stopPropagation();
          e.preventDefault();
          g.current.swiped = false;
        }
      }}
    >
      {pages.map((p, i) => (
        <Slot key={i} index={i} pos={pos} active={i === active} scroll={p.scroll}>
          {p.node}
        </Slot>
      ))}
    </div>
  );
}

function Slot({
  index,
  pos,
  active,
  scroll,
  children,
}: {
  index: number;
  pos: MotionValue<number>;
  active: boolean;
  scroll: boolean;
  children: ReactNode;
}) {
  const x = useTransform(pos, (p) => `${(index - p) * 100}%`);
  return (
    <motion.div style={{ x }} className="absolute inset-0">
      {/* each page scrolls on its own; inert keeps off-screen pages out of tab order and taps */}
      <div
        inert={!active}
        aria-hidden={!active}
        className={
          scroll
            ? "h-full touch-pan-y overflow-y-auto overflow-x-hidden overscroll-y-contain pt-[env(safe-area-inset-top)]"
            : "h-full overflow-hidden"
        }
      >
        {children}
      </div>
    </motion.div>
  );
}