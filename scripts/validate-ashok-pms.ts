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

  console.log("== Task 2: PMS bridge ==");
  const qaw = await getPmsAccountSeries("QAW00158");
  check("QAW00158 row count = 83", qaw.daily.length === 83, `got ${qaw.daily.length}`);
  check("QAW00158 currentValue", approx(qaw.currentValue, 23623722.55));
  check("QAW00158 deposited", approx(qaw.deposited, 23338000));
  check("QAW00158 totalProfit", approx(qaw.totalProfit, 285722.55));
  check("QAW00158 inception 2026-04-08", qaw.daily[0]?.date === "2026-04-08", qaw.daily[0]?.date);

  const qgf = await getPmsAccountSeries("QGF00157");
  check("QGF00157 currentValue", approx(qgf.currentValue, 28081182.05));
  check("QGF00157 totalProfit", approx(qgf.totalProfit, 4750336.05));

  const qtf = await getPmsAccountSeries("QTF00161");
  check("QTF00161 currentValue", approx(qtf.currentValue, 24026941.27));
  check("QTF00161 totalProfit", approx(qtf.totalProfit, 695941.27));

  console.log("== Task 4: PMS per-scheme views ==");
  const engine = getEngineForQcode(ASHOK)!;
  const res = await engine.handleGET(new Request(`http://local/api?qcode=${ASHOK}`));
  const data: Record<string, any> = await res.json();
  for (const label of ["Scheme PMS QAW", "Scheme PMS QGF", "Scheme PMS QTF"]) {
    check(`response has "${label}"`, !!data[label]);
  }
  check("Scheme PMS QGF currentExposure", approx(Number(data["Scheme PMS QGF"].data.currentExposure), 28081182.05));
  check("Scheme PMS QGF return ~20.36%",
    approx(Number(data["Scheme PMS QGF"].data.return), 20.36, 5));
  check("Scheme PMS QAW equity starts at 100",
    approx(data["Scheme PMS QAW"].data.equityCurve[0]?.nav, 100, 0.1));
  check("Scheme PMS QAW inception 2026-04-08",
    data["Scheme PMS QAW"].metadata.inceptionDate === "2026-04-08",
    data["Scheme PMS QAW"].metadata.inceptionDate);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
