import { useEffect, useState } from "react";
import { cx } from "../lib/format";

/** Character-by-character typewriter reveal with a blinking terminal caret. */
export function GlitchText({
  text,
  speed = 25,
  className,
  caret = true,
}: {
  text: string;
  speed?: number;
  className?: string;
  caret?: boolean;
}) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return (
    <span className={cx("whitespace-pre-line", caret && shown.length < text.length && "nx-caret", className)}>
      {shown}
    </span>
  );
}

/** Renders text with a subtle chromatic-aberration glitch layer. */
export function GlitchLabel({
  children,
  className,
  color = "cyan",
}: {
  children: React.ReactNode;
  className?: string;
  color?: "cyan" | "magenta" | "green";
}) {
  const glow =
    color === "magenta" ? "nx-glow-mag" : color === "green" ? "nx-glow-green" : "nx-glow-cyan";
  return <span className={cx("nx-display", glow, className)}>{children}</span>;
}
