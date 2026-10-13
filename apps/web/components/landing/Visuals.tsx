// Decorative product visuals for the landing page showcase. All figures are the Helixa sample company.

const SOURCES = [
  ["QB", "QuickBooks Online"],
  ["X", "Xero"],
  ["N", "NetSuite"],
  ["SI", "Sage Intacct"],
  ["CSV", "CSV · Excel"],
];
// Source chip centres in the 300-unit-high wire canvas: 44px chips spread over 300px.
const WIRE_Y = [22, 86, 150, 214, 278];

export function ConnectVisual() {
  return (
    <div className="lv lv-connect" aria-hidden>
      <div className="lv-sources">
        {SOURCES.map(([mono, name], i) => (
          <span key={name} style={{ "--i": i } as React.CSSProperties}>
            <i>{mono}</i>
            {name}
          </span>
        ))}
      </div>
      <svg className="lv-wires" viewBox="0 0 120 300" preserveAspectRatio="none">
        {WIRE_Y.map((y, i) => (
          <g key={y}>
            <path d={`M0 ${y} C 70 ${y}, 50 150, 120 150`} />
            <circle r="2.2" className="lv-pulse">
              <animateMotion
                dur="2.4s"
                repeatCount="indefinite"
                begin={`${i * 0.45}s`}
                path={`M0 ${y} C 70 ${y}, 50 150, 120 150`}
              />
            </circle>
          </g>
        ))}
      </svg>
      <div className="lv-hub">
        <div className="lv-hub-core">
          <span className="lv-hub-icon">
            <span />
          </span>
          <span className="lv-hub-word">
            vant<i>ı</i>q
          </span>
        </div>
        <div className="lv-hub-text">
          <p>
            <b>24 months</b> of ledger, budget and cash
          </p>
          <p className="lv-dim">Re-uploads are deduplicated</p>
        </div>
      </div>
    </div>
  );
}

const MAP_ROWS = [
  ["6110", "CRO clinical trial services", "R&D · Clinical", "Confirmed"],
  ["6210", "CMC drug product manufacturing", "R&D · CMC", "Confirmed"],
  ["6310", "Lab supplies and reagents", "R&D · Lab", "Suggested"],
  ["6950", "Conference and travel", "G&A · Travel", "Suggested"],
  ["7310", "Office rent", "G&A · Facilities", "Confirmed"],
];

export function MapVisual() {
  return (
    <div className="lv lv-map" aria-hidden>
      <div className="lv-card-head">
        <span>Account mapping</span>
        <span className="lv-chip">3 of 5 confirmed</span>
      </div>
      {MAP_ROWS.map(([code, name, cat, state], i) => (
        <div key={code} className="lv-map-row" style={{ "--i": i } as React.CSSProperties}>
          <span className="lv-code">{code}</span>
          <span className="lv-name">{name}</span>
          <span className="lv-arrow">→</span>
          <span className="lv-cat">{cat}</span>
          <span className={state === "Confirmed" ? "lv-state lv-ok" : "lv-state"}>{state}</span>
        </div>
      ))}
    </div>
  );
}

const VAR_ROWS = [
  ["R&D · Clinical", "$1.71M", "$1.46M", "+16.9%", true],
  ["R&D · CMC", "$412k", "$420k", "−1.9%", false],
  ["G&A · People", "$388k", "$371k", "+4.6%", true],
  ["G&A · Facilities", "$96k", "$96k", "0.0%", false],
] as const;

export function ReviewVisual() {
  return (
    <div className="lv lv-review" aria-hidden>
      <div className="lv-card-head">
        <span>Variances · Sep 2026</span>
        <span className="lv-chip lv-chip-bad">Opex +7.3%</span>
      </div>
      <div className="lv-var-head">
        <span>Category</span>
        <span>Actual</span>
        <span>Budget</span>
        <span>Var</span>
      </div>
      {VAR_ROWS.map(([cat, a, b, v, bad], i) => (
        <div key={cat} className="lv-var-row" style={{ "--i": i } as React.CSSProperties}>
          <span>{cat}</span>
          <span>{a}</span>
          <span className="lv-dim">{b}</span>
          <span className={bad ? "lv-bad" : "lv-good"}>{v}</span>
        </div>
      ))}
      <div className="lv-ai">
        <p className="lv-ai-k">
          <span>AI draft</span> Cites 4 transactions
        </p>
        <p>Meridian Clinical Research billed three new HX-101 trial sites a month early. Timing, not overspend.</p>
        <div className="lv-ai-actions">
          <span className="lv-btn-ok">Accept</span>
          <span>Edit</span>
        </div>
      </div>
    </div>
  );
}

export function RunwayVisual() {
  // Helixa month-end cash in $M, Oct 2025 to Sep 2026, then the forecast at today's $4.08M/month burn.
  const actual = [22.8, 103.1, 99.0, 94.5, 90.0, 85.6, 80.9, 76.2, 71.9, 67.1, 64.4, 59.6];
  const burn = 4.08;
  const months = 27; // Oct 2025 .. Dec 2027
  const W = 440;
  const H = 230;
  const L = 44;
  const R = 16;
  const T = 18;
  const B = 30;
  const x = (i: number) => L + (i / (months - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / 120) * (H - T - B);
  const pt = (i: number, v: number) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
  const today = actual.length - 1;
  const fc = Array.from({ length: months - today }, (_, k) => Math.max(0, 59.6 - burn * k));
  const line = actual.map((v, i) => `${i ? "L" : "M"}${pt(i, v)}`).join(" ");
  const area = `${line} L${pt(today, 0)} L${pt(0, 0)} Z`;
  const fcLine = fc.map((v, k) => `${k ? "L" : "M"}${pt(today + k, v)}`).join(" ");
  // Band: spending 15% slower to 15% faster than today.
  const slow = fc.map((_, k) => Math.max(0, 59.6 - burn * 0.85 * k));
  const fast = fc.map((_, k) => Math.max(0, 59.6 - burn * 1.15 * k));
  const band =
    slow.map((v, k) => `${k ? "L" : "M"}${pt(today + k, v)}`).join(" ") +
    fast
      .map((v, k) => [today + k, v] as const)
      .reverse()
      .map(([i, v]) => ` L${pt(i, v)}`)
      .join("") +
    " Z";
  const zeroI = months - 1;
  return (
    <div className="lv lv-runway" aria-hidden>
      <div className="lv-card-head">
        <span>Cash runway</span>
        <span className="lv-chip">14.6 months</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`}>
        {[0, 40, 80, 120].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? "lv-axis" : "lv-grid"} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" className="lv-tick">
              {v === 0 ? "$0" : `$${v}M`}
            </text>
          </g>
        ))}
        {[
          [0, "Oct 25"],
          [today, "Sep 26"],
          [zeroI, "Dec 27"],
        ].map(([i, label]) => (
          <text key={label} x={x(i as number)} y={H - 8} textAnchor="middle" className="lv-tick">
            {label}
          </text>
        ))}
        <path d={band} className="lv-band" />
        <path d={area} className="lv-area" />
        <line x1={x(today)} x2={x(today)} y1={T} y2={y(0)} className="lv-today" />
        <text x={x(today) + 6} y={T + 10} className="lv-tick lv-tick-hi">
          Today
        </text>
        <path d={fcLine} className="lv-fc" />
        <path d={line} className="lv-line" pathLength={1} />
        <circle cx={x(1)} cy={y(actual[1]!)} r="4" className="lv-dot" />
        <text x={x(1) + 9} y={y(actual[1]!) - 6} className="lv-tick lv-tick-hi">
          +$85.0M funding
        </text>
        <circle cx={x(today)} cy={y(59.6)} r="4" className="lv-dot" />
        <circle cx={x(zeroI)} cy={y(0)} r="4.5" className="lv-zero" />
        <circle cx={x(zeroI)} cy={y(0)} r="4.5" className="lv-zero-ring" />
      </svg>
      <div className="lv-runway-foot">
        <div>
          <p className="lv-dim">Cash in bank</p>
          <b>$59.6M</b>
        </div>
        <div>
          <p className="lv-dim">Net burn</p>
          <b>$4.1M/mo</b>
        </div>
        <div>
          <p className="lv-dim">Runs out</p>
          <b className="lv-bad">Dec 2027</b>
        </div>
      </div>
    </div>
  );
}
