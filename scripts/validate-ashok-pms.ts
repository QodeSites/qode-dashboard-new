/**
 * Read-only validation for the Ashok Jogani HUF PMS blend.
 * Usage: npx tsx scripts/validate-ashok-pms.ts
 * NO DATABASE WRITES — only the engine's read-only handleGET + Prisma SELECTs.
 */
import { findByQcode } from "../app/lib/bifurcated-clients-registry";

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

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
