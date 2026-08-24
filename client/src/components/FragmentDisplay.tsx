import { motion, AnimatePresence } from "framer-motion";
import { cx } from "../lib/format";

type F = { value: number; missionOrder: number };

export function FragmentDisplay({
  fragments,
  totalSlots = 4,
  className,
}: {
  fragments: F[];
  totalSlots?: number;
  className?: string;
}) {
  const map = new Map(fragments.map((f) => [f.missionOrder, f.value]));
  return (
    <div className={cx("flex gap-2 justify-center", className)}>
      <AnimatePresence initial={false}>
        {Array.from({ length: totalSlots }, (_, i) => i + 1).map((order) => {
          const v = map.get(order);
          const has = v !== undefined;
          return (
            <motion.div
              key={order}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className={cx("nx-fragment", !has && "empty")}
              aria-label={has ? `Fragment ${order}: ${v}` : `Fragment ${order} missing`}
            >
              {has ? v : "▢"}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
