import Link from "next/link";
import { ProductWindow } from "@/components/landing/ProductWindow";
import { HeroStage, InView, NavShell, Reveal, SpotlightGroup } from "@/components/landing/motion";

const LEDGERS = ["QuickBooks Online", "Xero", "NetSuite", "Sage Intacct", "CSV", "Excel"];

const HEADLINE = ["Every", "dollar,", "traced", "to", "the"];

export default function LandingPage() {
  return (
    <main className="lp-page">
      <NavShell>
        <div className="lp-nav-inner">
          <Link href="/" className="lp-mark" aria-label="Vantiq home">
            vant
            <span className="lp-mark-i">
              ı<span aria-hidden />
            </span>
            q
          </Link>
          <nav aria-label="Sections" className="lp-nav-links">
            <a href="#product">Product</a>
            <a href="#how">How it works</a>
            <a href="#security">Security</a>
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

      {/* Hero */}
      <HeroStage className="lp-hero">
        <div className="lp-aurora" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="lp-hero-grid" aria-hidden />
        <div className="lp-hero-spot" aria-hidden />
        <div className="lp-grain" aria-hidden />

        <div className="lp-hero-copy">
          <p className="lp-badge">
            <span className="lp-badge-dot" />
            Finance review, built only for pharma and biotech
          </p>
          <h1 className="lp-h1">
            {HEADLINE.map((w, i) => (
              <span key={w + i} className="lp-word" style={{ "--i": i } as React.CSSProperties}>
                {w}{" "}
              </span>
            ))}
            <span className="lp-word lp-serif" style={{ "--i": HEADLINE.length } as React.CSSProperties}>
              molecule.
            </span>
          </h1>
          <p className="lp-sub">
            Vantiq turns your general ledger into a monthly review that speaks R&amp;D: budget versus actual by program and
            trial phase, CRO spend you can trace to the invoice, and a runway your board will believe.
          </p>
          <div className="lp-ctas">
            <Link href="/overview" className="lp-btn">
              Open the live demo
              <svg viewBox="0 0 16 16" aria-hidden>
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
            <Link href="/sign-up" className="lp-btn-ghost">
              Create your workspace
            </Link>
          </div>
          <p className="lp-hero-foot">Reads QuickBooks Online, Xero, NetSuite and Sage Intacct. CSV and Excel work today.</p>
        </div>

        <div className="lp-stage">
          <div className="lp-stage-glow" aria-hidden />
          <div className="lp-tilt">
            <ProductWindow />
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

      {/* Ledgers */}
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

      {/* Problem to answer */}
      <section className="lp-section lp-translate">
        <Reveal className="lp-translate-copy">
          <p className="lp-eyebrow">The gap</p>
          <h2 className="lp-h2">
            Your ledger says <span className="lp-mono-q">Professional services</span>. Your board asks{" "}
            <em className="lp-serif">which trial.</em>
          </h2>
          <p className="lp-body">
            Generic FP&amp;A tools stop at the chart of accounts. Vantiq maps every line to the program, phase and
            vendor it paid for, so the question after the number already has an answer.
          </p>
        </Reveal>
        <InView className="lp-ledger-card">
          <div className="lp-ledger-head">
            <span>General ledger · Sep 2026</span>
            <span className="lp-ledger-arrow">In Vantiq</span>
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

      {/* Features */}
      <section id="product" className="lp-section">
        <Reveal className="lp-section-head">
          <p className="lp-eyebrow">Product</p>
          <h2 className="lp-h2">Everything the monthly review needs. Nothing it doesn&apos;t.</h2>
        </Reveal>
        <SpotlightGroup className="lp-bento">
          <Reveal className="lp-cell lp-cell-wide" delay={0}>
            <div data-spot className="lp-cell-in">
              <div className="lp-cell-copy">
                <h3>A runway you can defend</h3>
                <p>Cash at every month end, the date it runs out at today&apos;s burn, and funding events on the line.</p>
              </div>
              <RunwayMini />
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
          <Reveal className="lp-cell" delay={0}>
            <div data-spot className="lp-cell-in">
              <div className="lp-cell-copy">
                <h3>Variances that explain themselves</h3>
                <p>A short note on every material variance, drafted by AI, labelled as such, and confirmed by a person.</p>
              </div>
              <div className="lp-mini-note">
                <p>
                  <span>AI draft</span> Confirmed by Dana O.
                </p>
                <p>HX-204 supply came in $8k under plan after Kestrel moved one batch to October.</p>
              </div>
            </div>
          </Reveal>
          <Reveal className="lp-cell" delay={80}>
            <div data-spot className="lp-cell-in">
              <div className="lp-cell-copy">
                <h3>Programs and phases, natively</h3>
                <p>Spend by molecule and trial phase, not by custom tags bolted onto generic accounts.</p>
              </div>
              <InView className="lp-phase">
                {[
                  ["HX-101", "Phase 2", 0.86],
                  ["HX-204", "Phase 1", 0.54],
                  ["HX-310", "Discovery", 0.28],
                ].map(([n, p, w], i) => (
                  <div key={n as string} style={{ "--i": i, "--w": w } as React.CSSProperties}>
                    <span>
                      <b>{n}</b> {p}
                    </span>
                    <i />
                  </div>
                ))}
              </InView>
            </div>
          </Reveal>
          <Reveal className="lp-cell" delay={160}>
            <div data-spot className="lp-cell-in">
              <div className="lp-cell-copy">
                <h3>Mapped in an afternoon</h3>
                <p>Vantiq suggests a category for every account. You confirm, and the numbers update everywhere.</p>
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

      {/* How it works */}
      <section id="how" className="lp-section">
        <Reveal className="lp-section-head">
          <p className="lp-eyebrow">How it works</p>
          <h2 className="lp-h2">
            From ledger to board-ready in <em className="lp-serif">three steps.</em>
          </h2>
        </Reveal>
        <InView className="lp-steps">
          {[
            ["Bring your books", "Upload a ledger, budget and cash export, or connect QuickBooks Online, Xero, NetSuite or Sage Intacct."],
            ["Confirm the mapping", "Accept the suggested category for each account. Anything unsure is flagged, never guessed silently."],
            ["Run the review", "Variances, programs, statements and runway, ready for the meeting and explained line by line."],
          ].map(([t, d], i) => (
            <div key={t} className="lp-step" style={{ "--i": i } as React.CSSProperties}>
              <span className="lp-step-n">0{i + 1}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </InView>
      </section>

      {/* Security */}
      <section id="security" className="lp-section lp-security">
        <Reveal className="lp-security-copy">
          <p className="lp-eyebrow">Security</p>
          <h2 className="lp-h2">Your books stay yours.</h2>
          <p className="lp-body">
            Each company&apos;s data is walled off inside the database itself, not just in the app code. Every change to
            a mapping or import is recorded with who made it and when.
          </p>
        </Reveal>
        <div className="lp-sec-grid">
          {[
            ["Isolated by design", "Row-level security in Postgres keeps every company's rows apart on every query."],
            ["Roles that fit finance", "Admin, finance and viewer access. Viewers read the review, nobody edits by accident."],
            ["Sessions done right", "Passwords hashed with scrypt. Session tokens are stored only as hashes."],
            ["A full audit trail", "Imports, mappings and member changes are logged with the person and the time."],
          ].map(([t, d], i) => (
            <Reveal key={t} className="lp-sec-item" delay={i * 70}>
              <h3>{t}</h3>
              <p>{d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Final call to action */}
      <section className="lp-final">
        <div className="lp-final-glow" aria-hidden />
        <div className="lp-hero-grid" aria-hidden />
        <Reveal className="lp-final-in">
          <h2 className="lp-final-h">
            Your next board meeting, <em className="lp-serif">already prepared.</em>
          </h2>
          <p>Explore the sample biotech in the demo, or create a workspace and load your own books.</p>
          <div className="lp-ctas">
            <Link href="/overview" className="lp-btn">
              Open the live demo
              <svg viewBox="0 0 16 16" aria-hidden>
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
            <Link href="/sign-up" className="lp-btn-ghost">
              Create your workspace
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="lp-footer">
        <span className="lp-mark lp-mark-sm">
          vant
          <span className="lp-mark-i">
            ı<span aria-hidden />
          </span>
          q
        </span>
        <p>Finance review for pharma and biotech.</p>
        <p className="lp-footer-r">© 2026 Vantiq Finance</p>
      </footer>
    </main>
  );
}

function RunwayMini() {
  // Simplified Helixa cash line: actual, then the forecast to zero.
  return (
    <InView className="lp-runway">
      <svg viewBox="0 0 320 120" preserveAspectRatio="none" aria-hidden>
        <path d="M0 96 L22 22 L44 26 L66 31 L88 35 L110 39 L132 43 L154 48 L176 52 L198 56 L220 58 L232 62" className="lp-r-line" pathLength={1} />
        <path d="M232 62 L320 112" className="lp-r-fc" />
        <circle cx="320" cy="112" r="4" className="lp-r-zero" />
      </svg>
      <div className="lp-runway-k">
        <span>
          <b className="num">14.6</b> months
        </span>
        <span>Runs out Dec 2027</span>
      </div>
    </InView>
  );
}
