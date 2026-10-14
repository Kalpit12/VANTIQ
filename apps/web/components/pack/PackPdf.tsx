import { Document, Line, Page, Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { formatAmount, formatCompactCurrency, formatDate, formatSignedAmount, formatSignedPct, type Variance } from "@vantiq/domain";
import type { PackData } from "@/lib/pack";

/**
 * The review pack as a PDF (A4 landscape). Renders from the same PackData as
 * the pack page. The built-in Helvetica only covers Latin-1, so text goes
 * through `t()` to swap the few typographic characters it lacks.
 */

const C = {
  ink: "#111827",
  ink2: "#4b5563",
  ink3: "#6b7280",
  line: "#e3e6e4",
  subtle: "#f0f2f1",
  accent: "#0e6e6a",
  good: "#1b7f4b",
  bad: "#b42318",
  warn: "#b54708",
  series: "#2a78d6",
};

const t = (s: string) => s.replace(/−/g, "-").replace(/→/g, "->").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/≥/g, ">=").replace(/≤/g, "<=");

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 44, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 9, color: C.ink },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  muted: { color: C.ink3 },
  row: { flexDirection: "row" },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 4, padding: 10 },
  th: { fontSize: 8, color: C.ink3, paddingVertical: 4 },
  td: { paddingVertical: 3 },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.ink3 },
});

const tone = (v: Variance) => (v.delta === 0 ? C.ink3 : v.favorable ? C.good : C.bad);
const pct = (v: Variance) => (v.comparison === 0 ? (v.actual === 0 ? "-" : "No budget") : t(formatSignedPct(v.deltaPct)));

function Footer({ data, status }: { data: PackData; status: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{t(`${data.companyName} · Review pack · ${data.label} · ${status}`)}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function TrendBars({ data }: { data: PackData["opexTrend"] }) {
  const W = 360;
  const H = 150;
  const L = 34;
  const B = 16;
  const max = Math.max(1, ...data.flatMap((d) => [d.actual, d.budget])) * 1.1;
  const bw = (W - L) / Math.max(1, data.length);
  const T = 8;
  const y = (v: number) => T + (H - B - T) * (1 - v / max);
  const budget = data.map((d, i) => `${i ? "L" : "M"}${(L + bw * i + bw / 2).toFixed(1)} ${y(d.budget).toFixed(1)}`).join(" ");
  const ticks = [0, max / 2, max];
  return (
    <Svg width={W} height={H}>
      {ticks.map((v) => (
        <Line key={v} x1={L} x2={W} y1={y(v)} y2={y(v)} stroke={C.line} strokeWidth={0.5} />
      ))}
      {ticks.map((v) => (
        <Text key={`l${v}`} x={L - 4} y={y(v) + 3} style={{ fontSize: 6.5 }} fill={C.ink3} textAnchor="end">
          {t(formatCompactCurrency(v))}
        </Text>
      ))}
      {data.map((d, i) => (
        <Rect key={d.label} x={L + bw * i + bw * 0.18} y={y(d.actual)} width={bw * 0.64} height={Math.max(0, H - B - y(d.actual))} fill={C.series} />
      ))}
      <Path d={budget} stroke={C.ink2} strokeWidth={1} strokeDasharray="3 2" fill="none" />
      {data.map((d, i) => (
        <Text key={`x${d.label}`} x={L + bw * i + bw / 2} y={H - 4} style={{ fontSize: 6.5 }} fill={C.ink3} textAnchor="middle">
          {d.label}
        </Text>
      ))}
    </Svg>
  );
}

function CashLine({ data }: { data: { label: string; value: number }[] }) {
  const W = 300;
  const H = 120;
  const L = 34;
  const B = 16;
  const max = Math.max(1, ...data.map((d) => d.value)) * 1.1;
  const x = (i: number) => L + ((W - L - 6) * i) / Math.max(1, data.length - 1);
  const T = 8;
  const y = (v: number) => T + (H - B - T) * (1 - v / max);
  const d = data.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  return (
    <Svg width={W} height={H}>
      {[0, max / 2, max].map((v) => (
        <Line key={v} x1={L} x2={W} y1={y(v)} y2={y(v)} stroke={C.line} strokeWidth={0.5} />
      ))}
      {[0, max / 2, max].map((v) => (
        <Text key={`l${v}`} x={L - 4} y={y(v) + 3} style={{ fontSize: 6.5 }} fill={C.ink3} textAnchor="end">
          {t(formatCompactCurrency(v))}
        </Text>
      ))}
      <Path d={d} stroke={C.series} strokeWidth={1.5} fill="none" />
      {data.map((p, i) =>
        i === 0 || i === data.length - 1 ? (
          <Text key={p.label} x={x(i)} y={H - 4} style={{ fontSize: 6.5 }} fill={C.ink3} textAnchor={i === 0 ? "start" : "end"}>
            {p.label}
          </Text>
        ) : null,
      )}
    </Svg>
  );
}

export function PackPdf({ data, status }: { data: PackData; status: string }) {
  return (
    <Document title={`${data.companyName} review pack ${data.label}`} author="Vantiq Finance" subject="Monthly finance review">
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={{ fontSize: 9, color: C.accent, fontFamily: "Helvetica-Bold", marginBottom: 6 }}>MONTHLY REVIEW PACK</Text>
        <Text style={s.h1}>{t(`${data.companyName} · ${data.label}`)}</Text>
        <Text style={[s.muted, { marginBottom: 16 }]}>{t(`${status} · Prepared ${formatDate(data.builtAt.slice(0, 10))} · USD`)}</Text>

        <View style={[s.row, { gap: 10, marginBottom: 16 }]}>
          {data.kpis.map((k) => (
            <View key={k.label} style={[s.card, { flex: 1 }]}>
              <Text style={[s.muted, { fontSize: 8 }]}>{k.label}</Text>
              <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", marginVertical: 3 }}>{t(k.value)}</Text>
              <Text style={{ fontSize: 8, color: k.variance ? tone(k.variance) : C.ink3 }}>
                {t(k.variance ? `${pct(k.variance)} vs budget · ${k.note}` : k.note)}
              </Text>
            </View>
          ))}
        </View>

        <View style={[s.row, { gap: 16 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.h2}>Summary</Text>
            {data.headlines.map((h) => (
              <View key={h} style={[s.row, { marginBottom: 5 }]}>
                <Text style={{ width: 10, color: C.accent }}>•</Text>
                <Text style={{ flex: 1 }}>{t(h)}</Text>
              </View>
            ))}
          </View>
          <View style={{ width: 370 }}>
            <Text style={s.h2}>Operating expenses by month</Text>
            <TrendBars data={data.opexTrend} />
            <Text style={[s.muted, { fontSize: 7.5, marginTop: 4 }]}>Bars: actual. Dashed line: budget.</Text>
          </View>
        </View>
        <Footer data={data} status={status} />
      </Page>

      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.h2}>{t(`Budget vs actual · ${data.label} and ${data.ytdLabel}`)}</Text>
        <Text style={[s.muted, { marginBottom: 6, fontSize: 8 }]}>USD thousands. Material lines are marked with a bar.</Text>
        <View style={[s.row, { borderBottomWidth: 1, borderColor: C.line }]}>
          <Text style={[s.th, { flex: 1 }]}>Line</Text>
          {["Actual", "Budget", "Variance", "Var %", "YTD actual", "YTD budget", "YTD var %"].map((h) => (
            <Text key={h} style={[s.th, { width: 62, textAlign: "right" }]}>
              {h}
            </Text>
          ))}
        </View>
        {data.lines.map((l) => (
          <View key={l.id} wrap={false} style={[s.row, { borderBottomWidth: 0.5, borderColor: C.line, backgroundColor: l.depth === 0 ? C.subtle : undefined }]}>
            <View style={{ width: 2, backgroundColor: l.material ? C.warn : undefined }} />
            <Text style={[s.td, { flex: 1, paddingLeft: 4 + l.depth * 10, fontFamily: l.group ? "Helvetica-Bold" : "Helvetica" }]}>{t(l.name)}</Text>
            <Text style={[s.td, { width: 62, textAlign: "right" }]}>{t(formatAmount(l.month.actual))}</Text>
            <Text style={[s.td, { width: 62, textAlign: "right", color: C.ink2 }]}>{t(formatAmount(l.month.comparison))}</Text>
            <Text style={[s.td, { width: 62, textAlign: "right", color: tone(l.month) }]}>{t(formatSignedAmount(l.month.delta))}</Text>
            <Text style={[s.td, { width: 62, textAlign: "right", color: tone(l.month) }]}>{pct(l.month)}</Text>
            <Text style={[s.td, { width: 62, textAlign: "right" }]}>{t(formatAmount(l.ytd.actual))}</Text>
            <Text style={[s.td, { width: 62, textAlign: "right", color: C.ink2 }]}>{t(formatAmount(l.ytd.comparison))}</Text>
            <Text style={[s.td, { width: 62, textAlign: "right", color: tone(l.ytd) }]}>{pct(l.ytd)}</Text>
          </View>
        ))}
        <Footer data={data} status={status} />
      </Page>

      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.h2}>{`Material variances · ${data.material.length}`}</Text>
        {data.material.length === 0 && <Text style={s.muted}>No line moved by more than the materiality threshold.</Text>}
        {data.material.map((m) => (
          <View key={m.id} wrap={false} style={[s.card, { marginBottom: 8 }]}>
            <View style={[s.row, { justifyContent: "space-between", marginBottom: 4 }]}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>{t(`${m.name}${m.parentName ? `  ·  ${m.parentName}` : ""}`)}</Text>
              <Text style={{ color: tone(m.variance) }}>
                {t(`${formatCompactCurrency(m.variance.actual)} vs ${formatCompactCurrency(m.variance.comparison)} · ${formatSignedAmount(m.variance.delta)}k · ${pct(m.variance)}`)}
              </Text>
            </View>
            {m.explanation ? (
              <>
                <Text style={{}}>{t(m.explanation.text)}</Text>
                <Text style={[s.muted, { fontSize: 7.5, marginTop: 3 }]}>
                  {m.explanation.status === "ai_draft"
                    ? `Draft, not yet reviewed (${m.explanation.source === "claude" ? "AI" : "auto"} draft)`
                    : `${m.explanation.status === "edited" ? "Edited" : "Accepted"}${m.explanation.by ? ` by ${m.explanation.by}` : ""}`}
                </Text>
                {m.cited.length > 0 && (
                  <View style={{ marginTop: 5, borderTopWidth: 0.5, borderColor: C.line, paddingTop: 3 }}>
                    {m.cited.map((c, i) => (
                      <View key={i} style={[s.row, { fontSize: 7.5, color: C.ink2, paddingVertical: 1 }]}>
                        <Text style={{ width: 60 }}>{formatDate(c.date)}</Text>
                        <Text style={{ width: 150 }}>{t(c.vendor)}</Text>
                        <Text style={{ flex: 1 }}>{t(c.memo)}</Text>
                        <Text style={{ width: 70, textAlign: "right" }}>{t(formatCompactCurrency(c.amount))}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <Text style={{ color: C.warn }}>No explanation yet.</Text>
            )}
          </View>
        ))}
        <Footer data={data} status={status} />
      </Page>

      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={[s.row, { gap: 24 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.h2}>{`R&D spend by program · ${data.label}`}</Text>
            <View style={[s.row, { borderBottomWidth: 1, borderColor: C.line }]}>
              <Text style={[s.th, { flex: 1 }]}>Program</Text>
              {["Actual", "Budget", "Var %"].map((h) => (
                <Text key={h} style={[s.th, { width: 60, textAlign: "right" }]}>
                  {h}
                </Text>
              ))}
            </View>
            {data.programs.map((p) => (
              <View key={p.label} style={[s.row, { borderBottomWidth: 0.5, borderColor: C.line }]}>
                <View style={[s.td, { flex: 1 }]}>
                  <Text>{t(p.label)}</Text>
                  <Text style={[s.muted, { fontSize: 7 }]}>{t(p.sublabel)}</Text>
                </View>
                <Text style={[s.td, { width: 60, textAlign: "right" }]}>{t(formatCompactCurrency(p.variance.actual))}</Text>
                <Text style={[s.td, { width: 60, textAlign: "right", color: C.ink2 }]}>{t(formatCompactCurrency(p.variance.comparison))}</Text>
                <Text style={[s.td, { width: 60, textAlign: "right", color: tone(p.variance) }]}>{pct(p.variance)}</Text>
              </View>
            ))}
          </View>
          <View style={{ width: 320 }}>
            <Text style={s.h2}>Cash and runway</Text>
            {data.cash ? (
              <>
                <Text style={{ marginBottom: 8 }}>
                  {t(
                    `${formatCompactCurrency(data.cash.balance)} in the bank. ${
                      data.cash.runwayMonths === null
                        ? "Cash is not decreasing."
                        : `About ${data.cash.runwayMonths.toFixed(1)} months of runway at ${formatCompactCurrency(data.cash.avgBurn)} a month net burn${data.cash.zeroText ? `, running out around ${data.cash.zeroText}` : ""}.`
                    }`,
                  )}
                </Text>
                <CashLine data={data.cash.trend} />
                <Text style={[s.muted, { fontSize: 7.5, marginTop: 4 }]}>Month-end cash, last 12 months.</Text>
              </>
            ) : (
              <Text style={s.muted}>No cash balances imported.</Text>
            )}
          </View>
        </View>
        <Footer data={data} status={status} />
      </Page>
    </Document>
  );
}
