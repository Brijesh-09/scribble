"use client";

import { useEffect, type ReactNode } from "react";
import { motion, useDragControls } from "motion/react";
import { X } from "lucide-react";

type Props = { title: string; onClose: () => void; children: ReactNode };

// render inside <AnimatePresence>{open && <Sheet ... />}</AnimatePresence>
export function Sheet({ title, onClose, children }: Props) {
  const controls = useDragControls();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <motion.div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      <motion.div
        role="dialog"
        aria-label={title}
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 100 || info.velocity.y > 500) onClose();
        }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", bounce: 0, duration: 0.5 }}
        className="glass-thick absolute inset-x-0 bottom-0 mx-auto flex max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] w-full max-w-[430px] flex-col rounded-t-[32px] shadow-[0_-20px_60px_rgba(0,0,0,0.5)]"
      >
        <div onPointerDown={(e) => controls.start(e)} className="touch-none select-none px-5 pt-3">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-white/25" />
          <div className="mt-3 flex items-center justify-between pb-3">
            <h2 className="font-script text-[32px] leading-none">{title}</h2>
            <button
              aria-label="Close"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onClose}
              className="grid size-9 place-items-center rounded-full bg-white/[0.08] active:scale-95"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
          {children}
        </div>
      </motion.div>
    </div>
  );
}