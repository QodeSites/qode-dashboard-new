/**
 * Read-only validation for the Ashok Jogani HUF PMS blend.
 * Usage: npx tsx scripts/validate-ashok-pms.ts
 * NO DATABASE WRITES — only the engine's read-only handleGET + Prisma SELECTs.
 */
import { findByQcode } from "../app/lib/bifurcated-clients-registry";
import { getPmsAccountSeries } from "../app/lib/pms-bridge";
import { getEngineForQcode } from "../app/lib/bifurcated-portfolio-utils";
import { buildCombinedHistorical } from "../app/lib/pms-blend";

const ASHOK = "QAC00110";
let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name} ${detail}`); failures++; }
}
function approx(a: number, b: number, tolPct = 0.5) {
  return Math.abs(a - b) <= Math.abs(b) * (tolPct / 100) + 1;
}

async function main() {
  console.log("== Task 1: config ==");
  const entry = findByQcode(ASHOK)!;
  const pm = entry.config.portfolioMapping;
  check("pmsSchemes has 3 entries", entry.config.pmsSchemes?.length === 3);
  for (const label of ["Scheme PMS QAW", "Scheme PMS QGF", "Scheme PMS QTF"]) {
    check(`portfolioMapping has "${label}"`, !!pm[label]);
    check(`"${label}" has pmsAccountCode`, !!pm[label]?.pmsAccountCode);
  }
  check("Zerodha schemes still present",
    !!pm["Scheme QAW++"] && !!pm["Scheme QAW+"] && !!pm["Total Portfolio"]);

  console.log("== Task 2: PMS bridge (drift-proof invariants) ==");
  for (const code of ["QAW00158", "QGF00157", "QTF00161"]) {
    const s = await getPmsAccountSeries(code);
    check(`${code} rows >= 83`, s.daily.length >= 83, `got ${s.daily.length}`);
    check(`${code} inception 2026-04-08`, s.daily[0]?.date === "2026-04-08", s.daily[0]?.date);
    check(`${code} currentValue == last daily value`,
      approx(s.currentValue, s.daily[s.daily.length - 1].value, 0.001),
      `cv=${s.currentValue} last=${s.daily[s.daily.length - 1].value}`);
    // Money identity: portfolio value = capital in + P&L. Drift-proof.
    check(`${code} value == deposited + profit`,
      approx(s.currentValue, s.deposited + s.totalProfit, 0.01),
      `cv=${s.currentValue} dep=${s.deposited} pnl=${s.totalProfit}`);
  }

  console.log("== Task 4: PMS per-scheme views (drift-proof) ==");
  const engine = getEngineForQcode(ASHOK)!;
  const res = await engine.handleGET(new Request(`http://local/api?qcode=${ASHOK}`));
  const data: Record<string, any> = await res.json();
  const PMS_LABELS = ["Scheme PMS QAW", "Scheme PMS QGF", "Scheme PMS QTF"];
  const PMS_CODES: Record<string, string> = {
    "Scheme PMS QAW": "QAW00158", "Scheme PMS QGF": "QGF00157", "Scheme PMS QTF": "QTF00161",
  };
  for (const label of PMS_LABELS) {
    check(`response has "${label}"`, !!data[label]);
    if (!data[label]) continue;
    const d = data[label].data;
    const bridge = await getPmsAccountSeries(PMS_CODES[label]);
    check(`${label} currentExposure == bridge currentValue`,
      approx(Number(d.currentExposure), bridge.currentValue, 0.001),
      `resp=${d.currentExposure} bridge=${bridge.currentValue}`);
    check(`${label} equity starts at 100`, approx(d.equityCurve[0]?.nav, 100, 0.1), `got ${d.equityCurve[0]?.nav}`);
    check(`${label} inception 2026-04-08`,
      data[label].metadata.inceptionDate === "2026-04-08", data[label].metadata.inceptionDate);
    const c = d.equityCurve;
    const expectedRet = (c[c.length - 1].nav / c[0].nav - 1) * 100;
    check(`${label} return matches its curve`, approx(Number(d.return), expectedRet, 1),
      `resp=${d.return} curve=${expectedRet.toFixed(2)}`);
  }

  console.log("== Task 5a: blend math (synthetic) ==");
  // Two components: A flat (nav 10→10), B grows 10→11 on day 2, equal prior value.
  const blended = buildCombinedHistorical([
    { daily: [
      { date: "2026-01-01", value: 100, nav: 10, pnl: 0, cashIn: 100 },
      { date: "2026-01-02", value: 100, nav: 10, pnl: 0, cashIn: 0 },
    ]},
    { daily: [
      { date: "2026-01-01", value: 100, nav: 10, pnl: 0, cashIn: 100 },
      { date: "2026-01-02", value: 110, nav: 11, pnl: 10, cashIn: 0 },
    ]},
  ]);
  // Day 1 base 100; day 2 = equal-weighted avg of (0%, +10%) = +5% → 105.
  check("blend day1 nav = 100", approx(blended[0].nav, 100, 0.01));
  check("blend day2 nav = 105", approx(blended[1].nav, 105, 0.01), `got ${blended[1]?.nav}`);

  console.log("== Task 5b: blended Total Portfolio (drift-proof) ==");
  const tp = data["Total Portfolio"].data;
  // NOTE: we deliberately do NOT assert `TP amountDeposited == Σ scheme
  // amountDeposited`. Inactive schemes (Scheme QAW+) display ₹0 via
  // displayAmountInvestedAsZero while the TP counts their real net flows, so
  // that identity is false by design. The money identity
  // (currentValue == amountDeposited + totalProfit) is the correct cross-check.
  // Total = sum of parts: TP current value ≈ Σ every scheme's currentExposure.
  const PART_KEYS = ["Scheme QAW++", "Scheme QAW+", ...PMS_LABELS];
  const sumCurrent = PART_KEYS.reduce((s, k) => s + Number(data[k].data.currentExposure), 0);
  check("TP currentExposure == Σ scheme currentExposures",
    approx(Number(tp.currentExposure), sumCurrent, 0.5),
    `tp=${tp.currentExposure} sumParts=${sumCurrent}`);
  const sumProfit = PART_KEYS.reduce((s, k) => s + Number(data[k].data.totalProfit), 0);
  check("TP totalProfit == Σ scheme totalProfits",
    approx(Number(tp.totalProfit), sumProfit, 0.5),
    `tp=${tp.totalProfit} sumParts=${sumProfit}`);
  // Money identity for the blended TP: currentValue == amountDeposited + totalProfit.
  // Catches any future case where a component's pnl/cashflow is silently dropped.
  check("TP money identity (value == invested + profit)",
    approx(Number(tp.currentExposure), Number(tp.amountDeposited) + Number(tp.totalProfit), 0.5),
    `cv=${tp.currentExposure} dep=${tp.amountDeposited} pnl=${tp.totalProfit}`);
  // TP must exceed the 3 PMS accounts alone (it also holds the Zerodha QAW++).
  const sumPms = PMS_LABELS.reduce((s, k) => s + Number(data[k].data.currentExposure), 0);
  check("TP currentExposure > Σ PMS alone", Number(tp.currentExposure) > sumPms);
  check("TP inception = 2026-04-08",
    data["Total Portfolio"].metadata.inceptionDate === "2026-04-08",
    data["Total Portfolio"].metadata.inceptionDate);
  check("TP equity curve starts at 100",
    approx(tp.equityCurve[0]?.nav, 100, 0.1), `got ${tp.equityCurve[0]?.nav}`);
  check("TP equity curve monotonic dates",
    tp.equityCurve.every((p: any, i: number, a: any[]) => i === 0 || a[i-1].date <= p.date));

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
