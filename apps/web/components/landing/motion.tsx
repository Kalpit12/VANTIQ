"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Calls back once when the element first scrolls into view. */
function useInView<T extends Element>(margin = "0px 0px -12% 0px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return [ref, seen] as const;
}

/** Fades and lifts its children in when they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <Tag
      ref={ref as never}
      data-in={seen || undefined}
      className={`lp-reveal ${className}`}
      style={{ "--d": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

/** Marks a block as "in view" so CSS can play its entry animations. */
export function InView({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} data-in={seen || undefined} className={className}>
      {children}
    </div>
  );
}

/** Counts from zero to `to` when visible. */
export function CountUp({
  to,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1600,
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const [ref, seen] = useInView<HTMLSpanElement>("0px");
  const [value, setValue] = useState(to);
  useEffect(() => {
    if (!seen || reduced()) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setValue(to * (1 - Math.pow(1 - p, 4)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setValue(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, to, duration]);
  return (
    <span ref={ref} className="num">
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** Types text out once visible, with a blinking caret while typing. */
export function TypeText({ text, speed = 18, delay = 600 }: { text: string; speed?: number; delay?: number }) {
  const [ref, seen] = useInView<HTMLSpanElement>("0px");
  const [n, setN] = useState(text.length);
  useEffect(() => {
    if (!seen || reduced()) return;
    setN(0);
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      i += 1;
      setN(i);
      if (i < text.length) timer = setTimeout(step, speed);
    };
    timer = setTimeout(step, delay);
    return () => clearTimeout(timer);
  }, [seen, text, speed, delay]);
  return (
    <span ref={ref}>
      {text.slice(0, n)}
      {n < text.length && <span className="lp-caret" aria-hidden />}
    </span>
  );
}

/** Top bar that turns into frosted glass once the page scrolls. */
export function NavShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header data-scrolled={scrolled || undefined} className="lp-nav">
      {children}
    </header>
  );
}

/**
 * Hero stage: a soft light follows the pointer, and the product window
 * tilts back from a perspective angle to flat as the page scrolls.
 */
export function HeroStage({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const p = Math.min(1, window.scrollY / (window.innerHeight * 0.6));
        el.style.setProperty("--tilt", String(1 - p));
      });
    };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointermove", onMove);
    };
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Lights up each card's border where the pointer is. */
export function SpotlightGroup({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      for (const card of el.querySelectorAll<HTMLElement>("[data-spot]")) {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--sx", `${e.clientX - r.left}px`);
        card.style.setProperty("--sy", `${e.clientY - r.top}px`);
      }
    };
    el.addEventListener("pointermove", onMove);
    return () => el.removeEventListener("pointermove", onMove);
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
