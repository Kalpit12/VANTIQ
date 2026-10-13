import Link from "next/link";
import { ProductWindow } from "@/components/landing/ProductWindow";
import { ConnectVisual, MapVisual, ReviewVisual, RunwayVisual } from "@/components/landing/Visuals";
import {
  CountUp,
  HeroStage,
  InView,
  MoleculeField,
  NavShell,
  Reveal,
  ScrollWords,
  Showcase,
  SpotlightGroup,
} from "@/components/landing/motion";

const LEDGERS = ["QuickBooks Online", "Xero", "NetSuite", "Sage Intacct", "CSV", "Excel"];

const STATEMENT =
  "Your ledger says *Professional *services, *$412,500. Your board asks which trial, which phase, and how long the cash lasts. Vantiq answers *all *three before the meeting starts.";

const FAQ = [
  [
    "Who is Vantiq for?",
    "Finance teams at biotech and pharma companies, from a 50-person biotech with one controller to mid-size firms with several programs in the clinic.",
  ],
  [
    "Do we have to change accounting systems?",
    "No. Vantiq reads the books you already keep. CSV and Excel uploads work today, and direct connections to QuickBooks Online, Xero, NetSuite and Sage Intacct are next on the roadmap.",
  ],
  [
    "How long does setup take?",
    "Upload a ledger, a budget and month-end cash, confirm the suggested account mapping, and the review is ready. Re-uploading a file never double counts.",
  ],
  [
    "How is our data kept separate from other companies?",
    "Every company's rows are walled off by row-level security in the database itself, on top of the checks in the app. Sessions are stored only as hashes and every change is logged.",
  ],
  [
    "Where does the AI come in?",
    "It drafts short explanations for material variances and suggests account mappings. Every draft is labelled, cites the transactions it used, and is confirmed by a person before anyone else sees it.",
  ],
];

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? "lp-mark lp-mark-sm" : "lp-mark"}>
      vant
      <span className="lp-mark-i">
        ı<span aria-hidden />
      </span>
      q
    </span>
  );
}

export default function LandingPage() {
  return (
    <main className="lp-page">
      <NavShell>
        <div className="lp-nav-inner">
          <Link href="/" aria-label="Vantiq home">
            <Mark />
          </Link>
          <nav aria-label="Sections" className="lp-nav-links">
            <a href="#product">Product</a>
            <a href="#features">Features</a>
            <a href="#security">Security</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="lp-nav-cta">
            <Link href="/sign-in" className="lp-nav-signin">
              Sign in
            </Link>
            <Link href="/overview" className="lp-btn lp-btn-small">
              Open the demo
            </Link>
          </div>
        </div>
      </NavShell>

      {/* ---------- Hero ---------- */}
      <HeroStage className="lp-hero">
        <MoleculeField className="lp-field" />
        <div className="lp-aurora" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="lp-hero-spot" aria-hidden />
        <div className="lp-grain" aria-hidden />

        <div className="lp-hero-copy">
          <Link href="/overview" className="lp-badge">
            <span className="lp-badge-tag">New</span>
            Account mapping and file import are live
            <Arrow />
          </Link>
          <h1 className="lp-h1">
            <span className="lp-h1-line">
              <span className="lp-word" style={{ "--i": 0 } as React.CSSProperties}>
                Every dollar,
              </span>
            </span>
            <span className="lp-h1-line">
              <span className="lp-word" style={{ "--i": 1 } as React.CSSProperties}>
                traced to <span className="lp-glow-text">the molecule.</span>
              </span>
            </span>
          </h1>
          <p className="lp-sub">
            The finance review built only for pharma and biotech. Budget versus actual by program and trial phase, CRO
            spend traced to the invoice, and a runway your board will believe.
          </p>
          <div className="lp-ctas">
            <Link href="/overview" className="lp-btn">
              Open the live demo
              <Arrow />
            </Link>
            <Link href="/sign-up" className="lp-btn-ghost">
              Create your workspace
            </Link>
          </div>
          <ul className="lp-hero-points" aria-label="Highlights">
            <li>Live in an afternoon</li>
            <li>Reads your existing ledger</li>
            <li>Every AI note cites its source</li>
          </ul>
        </div>

        <div className="lp-stage">
          <div className="lp-horizon" aria-hidden />
          <div className="lp-tilt">
            <div className="lp-beam">
              <ProductWindow />
            </div>
            <div className="lp-float lp-float-a" aria-hidden>
              <span className="lp-float-icon">✓</span>
              <div>
                <p>6110 CRO clinical trial services</p>
                <b>Mapped to HX-101 · Clinical</b>
              </div>
            </div>
            <div className="lp-float lp-float-b" aria-hidden>
              <p>Variance flagged</p>
              <b>
                Opex <em>+7.3%</em> vs budget
              </b>
            </div>
          </div>
        </div>
      </HeroStage>

      {/* ---------- Ledgers ---------- */}
      <section className="lp-ledgers" aria-label="Accounting systems">
        <p>Works on top of the books you already keep</p>
        <div className="lp-marquee">
          <div className="lp-marquee-track">
            {[...LEDGERS, ...LEDGERS, ...LEDGERS, ...LEDGERS].map((l, i) => (
              <span key={i} aria-hidden={i >= LEDGERS.length || undefined}>
                {l}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Statement ---------- */}
      <section className="lp-statement" aria-label="Why Vantiq">
        <p className="lp-eyebrow">The gap</p>
        <ScrollWords text={STATEMENT} className="lp-statement-text" />
        <InView className="lp-ledger-card">
          <div className="lp-ledger-head">
            <span>General ledger · Sep 2026</span>
            <span className="lp-ledger-arrow">Seen by Vantiq</span>
          </div>
          {[
            ["6110", "Professional services", "$412,500", "HX-101", "Phase 2 · CRO"],
            ["6210", "Contract manufacturing", "$98,000", "HX-204", "Phase 1 · CMC"],
            ["6310", "Lab supplies", "$21,400", "HX-310", "Discovery"],
            ["6950", "Travel and conferences", "$14,250", "G&A", "Not R&D"],
          ].map(([code, name, amt, prog, tag], i) => (
            <div key={code} className="lp-ledger-row" style={{ "--i": i } as React.CSSProperties}>
              <span className="lp-ledger-code">{code}</span>
              <span className="lp-ledger-swap">
                <span className="lp-ledger-from">{name}</span>
                <span className="lp-ledger-to">
                  <b>{prog}</b> {tag}
                </span>
              </span>
              <span className="lp-ledger-amt num">{amt}</span>
            </div>
          ))}
        </InView>
      </section>

      {/* ---------- Showcase ---------- */}
      <section id="product" className="lp-section">
        <Reveal className="lp-section-head lp-center">
          <p className="lp-eyebrow">Product</p>
          <h2 className="lp-h2">
            From raw ledger to <span className="lp-glow-text">board-ready</span> in one sitting.
          </h2>
          <p className="lp-lead">Four steps, one workspace. No spreadsheets passed around the night before the meeting.</p>
        </Reveal>
        <Showcase
          steps={[
            {
              key: "connect",
              eyebrow: "Bring your books",
              title: "Your ledger, budget and cash in one place.",
              body: "Upload exports from the system you already use. Vantiq checks every column, skips bad rows with a reason, and never double counts a re-upload.",
              visual: <ConnectVisual />,
            },
            {
              key: "map",
              eyebrow: "Confirm the mapping",
              title: "Every account lands in the right bucket.",
              body: "Vantiq suggests a category for each account in pharma terms: clinical, CMC, lab, G&A. You confirm with one click and the numbers update everywhere.",
              visual: <MapVisual />,
            },
            {
              key: "review",
              eyebrow: "Run the review",
              title: "Variances that explain themselves.",
              body: "Material variances are flagged automatically, each with a short AI-drafted note that cites its transactions. Accept, edit or reject it before the meeting.",
              visual: <ReviewVisual />,
            },
            {
              key: "runway",
              eyebrow: "Defend the runway",
              title: "A cash date you can stand behind.",
              body: "Cash at every month end, funding events on the line, and the month it runs out at today's burn, with a band for spending a little faster or slower.",
              visual: <RunwayVisual />,
            },
          ]}
        />
      </section>

      {/* ---------- Bento ---------- */}
      <section id="features" className="lp-section">
        <Reveal className="lp-section-head">
          <p className="lp-eyebrow">Features</p>
          <h2 className="lp-h2">Built for how biotech finance actually works.</h2>
        </Reveal>
        <SpotlightGroup className="lp-bento">
          <Reveal className="lp-cell lp-cell-wide">
            <div data-spot className="lp-cell-in">
              <div className="lp-cell-copy">
                <h3>Programs and phases, natively</h3>
                <p>Spend by molecule and trial phase, not by custom tags bolted onto generic accounts.</p>
              </div>
              <InView className="lp-phase">
                {[
                  ["HX-101", "Solid tumors · Phase 2", 0.86, "$1.71M"],
                  ["HX-204", "Lupus · Phase 1", 0.54, "$1.06M"],
                  ["HX-310", "Discovery", 0.28, "$0.55M"],
                ].map(([n, p, w, amt], i) => (
                  <div key={n as string} style={{ "--i": i, "--w": w } as React.CSSProperties}>
                    <span>
                      <b>{n}</b> {p}
                    </span>
                    <span className="lp-phase-amt num">{amt}</span>
                    <i />
                  </div>
                ))}
              </InView>
            </div>
          </Reveal>
          <Reveal className="lp-cell" delay={80}>
            <div data-spot className="lp-cell-in">
              <div className="lp-cell-copy">
                <h3>Every number is a door</h3>
                <p>Click any figure to see what&apos;s behind it, down to the transaction.</p>
              </div>
              <InView className="lp-drill">
                {["Operating expenses", "R&D", "CRO services", "Meridian Clinical", "4 transactions"].map((s, i) => (
                  <span key={s} style={{ "--i": i } as React.CSSProperties}>
                    {s}
                  </span>
                ))}
              </InView>
            </div>
          </Reveal>
          <Reveal className="lp-cell">
            <div data-spot className="lp-cell-in">
              <div className="lp-cell-copy">
                <h3>Roles that fit finance</h3>
                <p>Admins manage, finance edits, viewers read. Nobody changes a number by accident.</p>
              </div>
              <div className="lp-roles">
                {[
                  ["KP", "Admin"],
                  ["DO", "Finance"],
                  ["MR", "Viewer"],
                ].map(([i, r]) => (
                  <span key={r}>
                    <i>{i}</i>
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal className="lp-cell" delay={80}>
            <div data-spot className="lp-cell-in">
              <div className="lp-cell-copy">
                <h3>Statements in one click</h3>
                <p>Income statement, balance sheet and cash flow by month or year to date.</p>
              </div>
              <div className="lp-stmt">
                {[
                  ["Grant revenue", "$1.20M"],
                  ["Research and development", "($3.32M)"],
                  ["General and administrative", "($0.98M)"],
                  ["Net loss", "($3.10M)"],
                ].map(([k, v]) => (
                  <p key={k}>
                    <span>{k}</span>
                    <b className="num">{v}</b>
                  </p>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal className="lp-cell" delay={160}>
            <div data-spot className="lp-cell-in">
              <div className="lp-cell-copy">
                <h3>Mapped in an afternoon</h3>
                <p>Suggestions for every account. You confirm, the review updates.</p>
              </div>
              <InView className="lp-checks">
                {["4100 Grant revenue", "6110 CRO services", "6210 CMC manufacturing", "7310 Rent"].map((a, i) => (
                  <span key={a} style={{ "--i": i } as React.CSSProperties}>
                    <i>✓</i>
                    {a}
                  </span>
                ))}
              </InView>
            </div>
          </Reveal>
        </SpotlightGroup>
      </section>

      {/* ---------- Numbers ---------- */}
      <section className="lp-numbers" aria-label="Vantiq in numbers">
        {[
          { to: 200, suffix: "k", label: "ledger rows per import" },
          { to: 3, suffix: "", label: "access roles, from admin to viewer" },
          { to: 3, suffix: "", label: "clicks from any number to its transactions" },
          { to: 100, suffix: "%", label: "of AI notes cite their transactions" },
        ].map((n, i) => (
          <Reveal key={n.label} className="lp-number" delay={i * 90}>
            <b>
              <CountUp to={n.to} suffix={n.suffix} />
            </b>
            <p>{n.label}</p>
          </Reveal>
        ))}
      </section>

      {/* ---------- Security ---------- */}
      <section id="security" className="lp-section lp-security">
        <Reveal className="lp-security-copy">
          <p className="lp-eyebrow">Security</p>
          <h2 className="lp-h2">Your books stay yours.</h2>
          <p className="lp-lead">
            Each company&apos;s data is walled off inside the database itself, not just in the app code. Every import,
            mapping change and new member is recorded with who did it and when.
          </p>
          <ul className="lp-sec-list">
            <li>Row-level security on every company table</li>
            <li>Passwords hashed with scrypt, sessions stored only as hashes</li>
            <li>Admin, finance and viewer roles</li>
            <li>A full audit trail of changes</li>
          </ul>
        </Reveal>
        <div className="lp-orbit" aria-hidden>
          <div className="lp-orbit-ring lp-orbit-1">
            <span>Audit log</span>
          </div>
          <div className="lp-orbit-ring lp-orbit-2">
            <span>Roles</span>
          </div>
          <div className="lp-orbit-ring lp-orbit-3">
            <span>Row-level security</span>
          </div>
          <div className="lp-orbit-core">
            <svg viewBox="0 0 24 24">
              <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="lp-section lp-faq">
        <Reveal className="lp-section-head">
          <p className="lp-eyebrow">FAQ</p>
          <h2 className="lp-h2">Questions finance teams ask first.</h2>
        </Reveal>
        <div className="lp-faq-list">
          {FAQ.map(([q, a], i) => (
            <Reveal key={q} delay={i * 50}>
              <details className="lp-faq-item">
                <summary>
                  {q}
                  <span aria-hidden />
                </summary>
                <p>{a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- Final call to action ---------- */}
      <section className="lp-final">
        <div className="lp-final-horizon" aria-hidden />
        <Reveal className="lp-final-in">
          <h2 className="lp-final-h">
            Your next board meeting, <span className="lp-glow-text">already prepared.</span>
          </h2>
          <p>Explore the sample biotech in the demo, or create a workspace and load your own books.</p>
          <div className="lp-ctas">
            <Link href="/overview" className="lp-btn">
              Open the live demo
              <Arrow />
            </Link>
            <Link href="/sign-up" className="lp-btn-ghost">
              Create your workspace
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <Mark small />
          <p>The finance review for pharma and biotech.</p>
        </div>
        <nav aria-label="Footer" className="lp-footer-cols">
          <div>
            <p>Product</p>
            <a href="#product">How it works</a>
            <a href="#features">Features</a>
            <Link href="/overview">Live demo</Link>
          </div>
          <div>
            <p>Company</p>
            <a href="#security">Security</a>
            <a href="#faq">FAQ</a>
          </div>
          <div>
            <p>Account</p>
            <Link href="/sign-in">Sign in</Link>
            <Link href="/sign-up">Create a workspace</Link>
          </div>
        </nav>
        <p className="lp-footer-base">© 2026 Vantiq Finance</p>
      </footer>
    </main>
  );
}
