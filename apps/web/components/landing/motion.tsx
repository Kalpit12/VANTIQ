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

/**
 * A slow-drifting field of nodes joined by thin bonds, like a molecule
 * lattice. Nodes near the pointer brighten and bond more readily.
 */
export function MoleculeField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = reduced();
    let w = 0;
    let h = 0;
    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pointer = { x: -9999, y: -9999 };
    type Node = { x: number; y: number; vx: number; vy: number; r: number };
    let nodes: Node[] = [];
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(90, (w * h) / 16000));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: Math.random() * 1.4 + 0.6,
      }));
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const n of nodes) {
        if (!still) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < -20) n.x = w + 20;
          if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20;
          if (n.y > h + 20) n.y = -20;
        }
      }
      const max = 130;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]!;
        const pa = Math.hypot(a.x - pointer.x, a.y - pointer.y);
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]!;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const reach = pa < 180 ? max * 1.35 : max;
          if (d < reach) {
            const alpha = (1 - d / reach) * (pa < 180 ? 0.5 : 0.18);
            ctx.strokeStyle = `rgba(110, 214, 203, ${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        const glow = pa < 180 ? 1 - pa / 180 : 0;
        ctx.fillStyle = `rgba(160, 236, 226, ${0.35 + glow * 0.65})`;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r + glow * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      if (still) draw();
    };
    const onLeave = () => {
      pointer.x = pointer.y = -9999;
    };
    // Pause when off screen so scrolling stays smooth.
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      const now = !!e?.isIntersecting;
      if (now && !visible && !still) raf = requestAnimationFrame(draw);
      if (!now) cancelAnimationFrame(raf);
      visible = now;
    });
    resize();
    draw();
    io.observe(canvas);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);
  return <canvas ref={ref} className={className} aria-hidden />;
}

/** Lights each word up in turn as the block scrolls through the viewport. */
export function ScrollWords({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = text.split(" ");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced()) {
      el.style.setProperty("--p", "1");
      return;
    }
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
        el.style.setProperty("--p", p.toFixed(3));
      });
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
    };
  }, []);
  return (
    <p ref={ref} className={`lp-words ${className}`} style={{ "--n": words.length } as CSSProperties}>
      {words.map((w, i) => (
        <span key={i} style={{ "--i": i } as CSSProperties} data-hl={w.startsWith("*") || undefined}>
          {w.replace(/^\*/, "")}{" "}
        </span>
      ))}
    </p>
  );
}

/**
 * Feature showcase: steps scroll on the left while a sticky panel on the
 * right shows the visual for whichever step is in the middle of the screen.
 */
export function Showcase({
  steps,
}: {
  steps: { key: string; eyebrow: string; title: string; body: string; visual: ReactNode }[];
}) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.idx));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const r of refs.current) if (r) io.observe(r);
    return () => io.disconnect();
  }, []);
  return (
    <div className="lp-show">
      <div className="lp-show-steps">
        {steps.map((s, i) => (
          <div
            key={s.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-idx={i}
            data-active={active === i || undefined}
            className="lp-show-step"
          >
            <p className="lp-show-n">
              <span>0{i + 1}</span> {s.eyebrow}
            </p>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
            <div className="lp-show-inline">{s.visual}</div>
          </div>
        ))}
      </div>
      <div className="lp-show-stage">
        <div className="lp-show-frame">
          {steps.map((s, i) => (
            <div key={s.key} className="lp-show-visual" data-active={active === i || undefined}>
              {s.visual}
            </div>
          ))}
          <div className="lp-show-dots">
            {steps.map((s, i) => (
              <span key={s.key} data-active={active === i || undefined} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
