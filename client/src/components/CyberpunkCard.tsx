import { cx } from "../lib/format";

export function CyberpunkCard({
  children,
  className,
  glow = false,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div className={cx("nx-card p-5", glow && "nx-card-cyan", className)}>
      {children}
    </div>
  );
}
