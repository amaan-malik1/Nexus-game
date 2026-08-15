import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

type ToastKind = "info" | "success" | "error" | "warn";
type ToastItem = { id: number; kind: ToastKind; message: string };

let counter = 1;
const listeners: Array<(t: ToastItem) => void> = [];

export function toast(message: string, kind: ToastKind = "info") {
  const t: ToastItem = { id: counter++, kind, message };
  listeners.forEach((l) => l(t));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const push = (t: ToastItem) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 3500);
    };
    listeners.push(push);
    return () => {
      const i = listeners.indexOf(push);
      if (i >= 0) listeners.splice(i, 1);
    };
  }, []);
  const color = (k: ToastKind) =>
    k === "success" ? "text-nx-green border-nx-green"
    : k === "error" ? "text-nx-danger border-nx-danger"
    : k === "warn"  ? "text-nx-yellow border-nx-yellow"
    :                 "text-nx-cyan border-nx-cyan";
  return (
    <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            className={`nx-card px-4 py-3 border ${color(t.kind)} nx-mono text-sm`}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
