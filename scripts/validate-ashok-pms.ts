/**
 * Read-only validation for the Ashok Jogani HUF PMS blend.
 * Usage: npx tsx scripts/validate-ashok-pms.ts
 * NO DATABASE WRITES — only the engine's read-only handleGET + Prisma SELECTs.
 */
import { findByQcode } from "../app/lib/bifurcated-clients-registry";
import { getPmsAccountSeries } from "../app/lib/pms-bridge";
import { getEngineForQcode } from "../app/lib/bifurcated-portfolio-utils";

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

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
