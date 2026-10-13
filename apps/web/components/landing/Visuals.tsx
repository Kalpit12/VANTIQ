// Decorative product visuals for the landing page showcase. All figures are the Helixa sample company.

const SOURCES = ["QuickBooks Online", "Xero", "NetSuite", "Sage Intacct", "CSV · Excel"];

export function ConnectVisual() {
  return (
    <div className="lv lv-connect" aria-hidden>
      <div className="lv-sources">
        {SOURCES.map((s, i) => (
          <span key={s} style={{ "--i": i } as React.CSSProperties}>
            <i />
            {s}
          </span>
        ))}
      </div>
      <svg className="lv-wires" viewBox="0 0 200 300" preserveAspectRatio="none">
        {[30, 90, 150, 210, 270].map((y, i) => (
          <path key={y} d={`M0 ${y} C 100 ${y}, 100 150, 200 150`} style={{ "--i": i } as React.CSSProperties} />
        ))}
      </svg>
      <div className="lv-hub">
        <div className="lv-hub-core">
          <span className="lv-hub-mark" />
        </div>
        <p>
          <b>24 months</b> of ledger, budget and cash
        </p>
        <p className="lv-dim">Re-uploads are deduplicated</p>
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
  const pts = [22.8, 103.1, 99.0, 94.5, 90.0, 85.6, 80.9, 76.2, 71.9, 67.1, 64.4, 59.6];
  const fc = Array.from({ length: 16 }, (_, k) => Math.max(0, 59.6 - 4.08 * k));
  const n = pts.length + fc.length - 1;
  const x = (i: number) => (i / (n - 1)) * 400;
  const y = (v: number) => 10 + (1 - v / 110) * 180;
  const a = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const f = fc.map((v, k) => `${k ? "L" : "M"}${x(pts.length - 1 + k).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  // Scenario band: burn 15% lower to 15% higher.
  const hi = fc.map((_, k) => Math.max(0, 59.6 - 4.08 * 0.85 * k));
  const lo = fc.map((_, k) => Math.max(0, 59.6 - 4.08 * 1.15 * k));
  const band =
    hi.map((v, k) => `${k ? "L" : "M"}${x(pts.length - 1 + k).toFixed(1)} ${y(v).toFixed(1)}`).join(" ") +
    " " +
    lo
      .map((v, k) => [x(pts.length - 1 + k), y(v)] as const)
      .reverse()
      .map(([px, py]) => `L${px.toFixed(1)} ${py.toFixed(1)}`)
      .join(" ") +
    " Z";
  return (
    <div className="lv lv-runway" aria-hidden>
      <div className="lv-card-head">
        <span>Cash runway</span>
        <span className="lv-chip">14.6 months</span>
      </div>
      <svg viewBox="0 0 400 200" preserveAspectRatio="none">
        <defs>
          <linearGradient id="lv-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#3fb8af" stopOpacity="0.35" />
            <stop offset="1" stopColor="#3fb8af" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${a} L${x(pts.length - 1)} 190 L0 190 Z`} fill="url(#lv-fill)" />
        <path d={band} className="lv-band" />
        <path d={a} className="lv-line" pathLength={1} />
        <path d={f} className="lv-fc" />
        <circle cx={x(n - 1)} cy={y(0)} r="4" className="lv-zero" />
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
