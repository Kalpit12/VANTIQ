import { CountUp, TypeText } from "./motion";

// Helixa sample company, month-end cash in $M (Oct 2025 to Sep 2026), then the forecast at today's burn.
const ACTUAL = [22.8, 103.1, 99.0, 94.5, 90.0, 85.6, 80.9, 76.2, 71.9, 67.1, 64.4, 59.6];
const BURN = 4.08;
const FORECAST = Array.from({ length: 16 }, (_, k) => Math.max(0, 59.6 - BURN * k));

const W = 560;
const H = 190;
const PAD = { l: 8, r: 8, t: 14, b: 22 };
const N = ACTUAL.length + FORECAST.length - 1;
const x = (i: number) => PAD.l + (i / (N - 1)) * (W - PAD.l - PAD.r);
const y = (v: number) => PAD.t + (1 - v / 110) * (H - PAD.t - PAD.b);
const line = (pts: [number, number][]) => pts.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)} ${b.toFixed(1)}`).join(" ");

const actualPts = ACTUAL.map((v, i) => [x(i), y(v)] as [number, number]);
const forecastPts = FORECAST.map((v, k) => [x(ACTUAL.length - 1 + k), y(v)] as [number, number]);
const actualPath = line(actualPts);
const forecastPath = line(forecastPts);
const areaPath = `${actualPath} L${x(ACTUAL.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;
const zero = forecastPts[forecastPts.length - 1]!;
const today = actualPts[actualPts.length - 1]!;
const funding = actualPts[1]!;

const PROGRAMS = [
  { name: "HX-101", phase: "Phase 2", spent: 0.92, budget: 0.79, over: true },
  { name: "HX-204", phase: "Phase 1", spent: 0.48, budget: 0.52, over: false },
  { name: "HX-310", phase: "Discovery", spent: 0.22, budget: 0.26, over: false },
];

const NAV = ["Overview", "Variances", "R&D programs", "Statements", "Import data", "Account mapping"];

/** A live-drawn imitation of the Vantiq overview screen, used in the hero. */
export function ProductWindow() {
  return (
    <div className="lp-window" aria-hidden>
      <div className="lp-window-bar">
        <span />
        <span />
        <span />
        <p>app.vantiq.finance/overview</p>
      </div>
      <div className="lp-window-body">
        <aside className="lp-window-side">
          <p className="lp-mini-mark">
            vant<i>ı</i>q
          </p>
          {NAV.map((n, i) => (
            <p key={n} data-active={i === 0 || undefined}>
              {n}
            </p>
          ))}
        </aside>
        <div className="lp-window-main">
          <div className="lp-window-head">
            <div>
              <p className="lp-k">Helixa Therapeutics · Sep 2026</p>
              <p className="lp-h">Overview</p>
            </div>
            <span className="lp-pill">Month · YTD</span>
          </div>

          <div className="lp-kpis">
            <div className="lp-kpi" style={{ "--i": 0 } as React.CSSProperties}>
              <p>Cash in bank</p>
              <b>
                <CountUp to={59.6} decimals={1} prefix="$" suffix="M" />
              </b>
            </div>
            <div className="lp-kpi" style={{ "--i": 1 } as React.CSSProperties}>
              <p>Runway</p>
              <b>
                <CountUp to={14.6} decimals={1} suffix=" mo" />
              </b>
            </div>
            <div className="lp-kpi" style={{ "--i": 2 } as React.CSSProperties}>
              <p>Net burn</p>
              <b>
                <CountUp to={4.1} decimals={1} prefix="$" suffix="M" />
              </b>
            </div>
            <div className="lp-kpi" style={{ "--i": 3 } as React.CSSProperties}>
              <p>Opex vs budget</p>
              <b className="lp-bad">
                <CountUp to={7.3} decimals={1} prefix="+" suffix="%" />
              </b>
            </div>
          </div>

          <div className="lp-panels">
            <div className="lp-panel lp-chart">
              <p className="lp-panel-title">Cash runs out around Dec 2027 at today&apos;s spending</p>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="lp-area" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="#3fb8af" stopOpacity="0.35" />
                    <stop offset="1" stopColor="#3fb8af" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0, 1, 2, 3].map((g) => (
                  <line key={g} x1={PAD.l} x2={W - PAD.r} y1={y(g * 36)} y2={y(g * 36)} className="lp-grid" />
                ))}
                <path d={areaPath} fill="url(#lp-area)" className="lp-area" />
                <path d={actualPath} pathLength={1} className="lp-line" />
                <path d={forecastPath} className="lp-forecast" />
                <line x1={today[0]} x2={today[0]} y1={PAD.t} y2={y(0)} className="lp-today" />
                <circle cx={today[0]} cy={today[1]} r="4" className="lp-dot" />
                <circle cx={zero[0]} cy={zero[1]} r="4" className="lp-zero" />
                <circle cx={zero[0]} cy={zero[1]} r="4" className="lp-zero-ring" />
                <circle cx={funding[0]} cy={funding[1]} r="3.5" className="lp-dot lp-dot-late" />
              </svg>
              <span className="lp-tag lp-tag-fund" style={{ left: `${(funding[0] / W) * 100}%`, top: `${(funding[1] / H) * 100}%` }}>
                Funding +$85.0M
              </span>
              <span className="lp-tag lp-tag-zero" style={{ left: `${(zero[0] / W) * 100}%`, top: `${(zero[1] / H) * 100}%` }}>
                Runs out · Dec 2027
              </span>
            </div>

            <div className="lp-panel">
              <p className="lp-panel-title">R&amp;D spend vs budget</p>
              <div className="lp-programs">
                {PROGRAMS.map((p, i) => (
                  <div key={p.name} className="lp-prog" style={{ "--i": i } as React.CSSProperties}>
                    <p>
                      <b>{p.name}</b> {p.phase}
                    </p>
                    <div className="lp-track">
                      <span className={p.over ? "lp-fill lp-fill-over" : "lp-fill"} style={{ "--w": p.spent } as React.CSSProperties} />
                      <span className="lp-target" style={{ left: `${p.budget * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="lp-note">
                <p className="lp-note-k">
                  <span>AI draft</span> HX-101 is 16.9% over budget
                </p>
                <p className="lp-note-t">
                  <TypeText text="Meridian Clinical Research billed $412.5k for 3 new trial sites a month early. Timing, not overspend." delay={1900} />
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
