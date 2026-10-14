"use client";

import { formatCompactCurrency, type BridgeStep } from "@vantiq/domain";
import { useState } from "react";
import { TooltipBox } from "./TrendChart";
import { useDrill } from "./useDrill";

/**
 * Variance bridge / waterfall (chart C5): budget → each driver → actual.
 * Hand-drawn SVG so every bar can be hovered and clicked to drill down.
 */
export function VarianceBridge({ steps }: { steps: BridgeStep[] }) {
  const drill = useDrill();
  const [hover, setHover] = useState<number | null>(null);
  const W = 760;
  const H = 300;
  const pad = { top: 28, right: 12, bottom: 56, left: 64 };
  const values = steps.flatMap((s) => [s.from, s.to]);
  const max = Math.max(...values);
  const minRaw = Math.min(...values.filter((v) => v > 0));
  // Start the axis below the smallest bar top so step sizes stay visible; bars from zero are cut and marked.
  const min = Math.max(0, Math.floor((minRaw * 0.85) / 1e8) * 1e8);
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const y = (v: number) => pad.top + plotH - ((Math.max(v, min) - min) / (max - min || 1)) * plotH;
  const band = plotW / steps.length;
  const barW = Math.min(64, band * 0.62);
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="group" aria-label="Variance bridge from budget to actual">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--text-muted)" className="num">
              {formatCompactCurrency(t)}
            </text>
          </g>
        ))}
        {steps.map((s, i) => {
          const x = pad.left + band * i + (band - barW) / 2;
          const top = y(Math.max(s.from, s.to));
          const bottom = y(Math.min(s.from, s.to));
          const total = s.kind !== "step";
          const fill = total ? "var(--series-1)" : s.favorable ? "var(--favorable)" : "var(--unfavorable)";
          const next = steps[i + 1];
          const clickable = s.kind === "step" && s.id !== "other";
          return (
            <g
              key={s.id}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => clickable && drill({ dc: s.id })}
              className={clickable ? "cursor-pointer" : ""}
              tabIndex={clickable ? 0 : -1}
              onKeyDown={(e) => e.key === "Enter" && clickable && drill({ dc: s.id })}
              role={clickable ? "button" : undefined}
              aria-label={`${s.label}: ${formatCompactCurrency(s.delta)}`}
            >
              <rect x={pad.left + band * i} y={pad.top} width={band} height={plotH} fill="transparent" />
              <rect
                x={x}
                y={top}
                width={barW}
                height={Math.max(2, bottom - top)}
                rx={3}
                fill={fill}
                fillOpacity={hover === null || hover === i ? (total ? 0.9 : 0.85) : 0.35}
              />
              {total && min > 0 && (
                <path d={`M${x} ${bottom - 6}l${barW / 4} -5l${barW / 4} 5l${barW / 4} -5l${barW / 4} 5`} stroke="var(--bg-surface)" strokeWidth="2.5" fill="none" />
              )}
              <text x={x + barW / 2} y={top - 6} textAnchor="middle" fontSize="12" fontWeight={total ? 600 : 500} fill="var(--text-primary)" className="num">
                {total ? formatCompactCurrency(s.to) : `${s.delta > 0 ? "+" : ""}${formatCompactCurrency(s.delta)}`}
              </text>
              <foreignObject x={pad.left + band * i} y={H - pad.bottom + 6} width={band} height={pad.bottom - 6}>
                <div className="px-1 text-center text-[11px] leading-[14px] text-ink-2">{s.label}</div>
              </foreignObject>
              {next && (
                <line
                  x1={x + barW}
                  x2={pad.left + band * (i + 1) + (band - barW) / 2}
                  y1={y(s.to)}
                  y2={y(s.to)}
                  stroke="var(--border-strong)"
                  strokeDasharray="2 2"
                />
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && steps[hover] && (
        <div
          className="pointer-events-none absolute z-10"
          style={{ left: `${((pad.left + band * hover + band / 2) / W) * 100}%`, top: 0, transform: "translateX(-50%)" }}
        >
          <TooltipBox
            title={steps[hover].label}
            hint={steps[hover].kind === "step" && steps[hover].id !== "other" ? "Click to see transactions" : null}
            rows={
              steps[hover].kind === "step"
                ? [
                    { label: "Change vs budget", value: steps[hover].delta },
                    { label: "Running total", value: steps[hover].to },
                  ]
                : [{ label: "Total", value: steps[hover].to }]
            }
          />
        </div>
      )}
      <p className="mt-1 text-[12px] text-ink-3">
        <span className="mr-3 inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-bad" /> Over budget (unfavorable)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-good" /> Under budget (favorable)
        </span>
      </p>
    </div>
  );
}
