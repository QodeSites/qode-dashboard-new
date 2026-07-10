/** Read-only: prints the engine's handleGET JSON for a qcode. */
import { getEngineForQcode } from "../app/lib/bifurcated-portfolio-utils";

async function main() {
  const qcode = process.argv[2];
  const engine = getEngineForQcode(qcode);
  if (!engine) { console.error(`no engine for ${qcode}`); process.exit(2); }
  const res = await engine.handleGET(
    new Request(`http://local/api?qcode=${qcode}`)
  );
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}
main();
