/**
 * TEMP read-only: run the real merged engine, optionally WITH a tag override,
 * and print the scheme metrics. READ-ONLY.
 * Usage: npx tsx scripts/_investigate-engine.ts <qcode> [scheme] [navTag] [depositTag] [cashflowTag]
 */
import { getEngineForQcode } from "../app/lib/bifurcated-portfolio-utils";

function num(s: string) { return Number(s); }

async function main() {
  const [, , qcode = "QAC00065", scheme, navTag, depositTag, cashflowTag] = process.argv;
  const engine = getEngineForQcode(qcode);
  if (!engine) { console.log(`No engine for ${qcode}`); process.exit(1); }

  const params = new URLSearchParams({ qcode });
  if (scheme) params.set("scheme", scheme);
  if (navTag) params.set("navTag", navTag);
  if (depositTag) params.set("depositTag", depositTag);
  if (cashflowTag) params.set("cashflowTag", cashflowTag);
  console.log("REQUEST:", params.toString());

  const res = await engine.handleGET(new Request(`http://localhost/api/bifurcated-portfolio?${params}`));
  const json: any = await res.json();

  for (const s of Object.keys(json)) {
    const d = json[s].data;
    const curve = d.equityCurve || [];
    console.log("\n" + "=".repeat(64));
    console.log(`SCHEME: ${s}`);
    console.log("=".repeat(64));
    console.log(`amountDeposited: ${d.amountDeposited}`);
    console.log(`currentExposure: ${d.currentExposure}`);
    console.log(`return:          ${d.return}%`);
    console.log(`totalProfit:     ${d.totalProfit}`);
    console.log(`equityCurve: ${curve.length} pts, first ${JSON.stringify(curve[0])}, last ${JSON.stringify(curve.at(-1))}`);
    console.log(`sinceInception (trailing): ${d.trailingReturns?.sinceInception}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error("ERR:", e); process.exit(1); });
