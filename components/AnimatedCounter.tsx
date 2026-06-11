"use client";

import { useEffect, useRef, useState } from "react";

export default function AnimatedCounter({
  value,
  duration = 900,
}: {
  value: number;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const from = fromRef.current;
    let raf = 0;

    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{display}</>;
}
