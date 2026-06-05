# Bifurcated Clients Refactor — Registry + Parameterized Routes

**Date:** 2026-05-26
**Status:** Approved design, ready for implementation plan
**Scope:** The 3 clients whose data lives in `bifurcated_master_sheet_test` — Dinesh (`QUS00072`/`QAC00053`), Arwani (`QUS00085`/`QAC00071`), Ashwin Agarwal (`QUS00097`/`QAC00083`).

## Goal

Make adding a new bifurcated client a **1-file-2-paste operation** that a teammate without much codebase context can do correctly, by extracting:

- A single client **registry** (one entry per client) as the source of truth.
- Two **parameterized API routes** (`/api/bifurcated-portfolio`, `/api/bifurcated-holdings`) that replace 6 per-client route files (~580 lines total today).
- A **`defineBifurcatedClient` helper** whose input shape matches the data team's tag-spec vocabulary (profit / exposure / scheme name) instead of the engine's internal field names (nav / current / metrics / sentinel constants).
- A **generalized investigation script** that emits paste-ready config + registry blocks.
- A **registry validator** that confirms each entry's data is present in the DB.
- A **runbook** that codifies the 6-step workflow.

The teammate's irreducible work after this refactor:

1. Receive the data team's tag spec.
2. Run `scripts/investigate-bifurcated-client.ts <qcode>`.
3. Create `app/lib/clients/<name>.ts` — paste the script's output, fill in the two profit tags from the data team's message.
4. Append registry entry — paste the script's output.
5. Run `scripts/validate-bifurcated-registry.ts` — green check.
6. Build, commit.

Two terminal commands, two paste operations, two file touches.

## Non-goals (out of scope)

- **Shilpa (`QUS00067`/`QAC00040`) and Vikram (`QUS00068`/`QAC00043`).** They use `BifurcatedPortfolioEngine` but read from `master_sheet` (no `qodeTotalPortfolioTag`). They keep their existing per-client routes and engine instances unchanged. Their `ClientConfig` constants move to `app/lib/clients/*.ts` for file-organization consistency only.
- **`BifurcatedPortfolioEngine` class internals.** Not touched.
- **`app/lib/distributor-utils.ts`.** Continues using `DineshApi` via a backward-compat shim.
- **Sarla / Satidham / PMS / regular-managed / prop flows.** Not touched.
- **Database schema** and **Prisma operations**. All changes are READ-ONLY per CLAUDE.md.
- **`app/lib/arwani-portfolio-utils.ts`** (legacy 1148-line unused file). Untouched; can be deleted in a follow-up.

## Constraints

- **READ-ONLY DB access**. No `create`/`update`/`delete`/`upsert`/`$executeRaw` may be introduced. The parameterized routes are SELECT-only mirrors of the existing per-client routes.
- **No regressions** for any of the 5 bifurcated-engine clients or for `distributor-utils.ts`.
- **Strangler-fig cutover** in 3 reversible commits. After commit 1, both old and new URLs must return byte-identical JSON (verifiable contract).
- **`*Api` exports stay** in `bifurcated-portfolio-utils.ts` (`DineshApi`, `ArwaniApi`, `AshwinApi`, `ShilpaApi`, `VikramApi`) as backward-compat shims for `distributor-utils.ts`.
- **Auth improvement is intentional.** The new parameterized portfolio route adds an icode-vs-qcode ownership check that today's per-client portfolio routes lack. This is a net security gain. The new holdings route mirrors the existing per-client holdings routes' auth pattern.

## File Layout

```
app/
├── lib/
│   ├── bifurcated-portfolio-utils.ts          # engine + helper + shim exports
│   ├── bifurcated-clients-registry.ts         # NEW — single source of truth
│   ├── bifurcated-auth.ts                     # NEW — shared auth helper for routes
│   └── clients/                                # NEW directory
│       ├── dinesh.ts                          # verbose ClientConfig (has inactive QTF)
│       ├── shilpa.ts                          # verbose ClientConfig (legacy)
│       ├── vikram.ts                          # verbose ClientConfig (legacy)
│       ├── arwani.ts                          # uses defineBifurcatedClient helper
│       └── ashwin.ts                          # uses defineBifurcatedClient helper
├── api/
│   ├── bifurcated-portfolio/route.ts          # NEW — parameterized
│   ├── bifurcated-holdings/route.ts           # NEW — parameterized
│   ├── dinesh-api/route.ts                    # DELETED in commit 3
│   ├── dinesh-holdings-api/route.ts           # DELETED in commit 3
│   ├── arwani-api/route.ts                    # DELETED in commit 3
│   ├── arwani-holdings-api/route.ts           # DELETED in commit 3
│   ├── ashwin-api/route.ts                    # DELETED in commit 3
│   ├── ashwin-holdings-api/route.ts           # DELETED in commit 3
│   ├── shilpa-api/route.ts                    # UNTOUCHED
│   └── vikram-api/route.ts                    # UNTOUCHED
docs/
└── how-to-add-a-bifurcated-client.md          # NEW — runbook
scripts/
├── investigate-bifurcated-client.ts            # NEW — generalized; emits paste-ready blocks
└── validate-bifurcated-registry.ts             # NEW — sanity-check every registry entry
```

## Component Design

### Registry (`app/lib/bifurcated-clients-registry.ts`)

The single source of truth for every client whose data lives in `bifurcated_master_sheet_test`.

```ts
import type { ClientConfig, FrozenSchemeData } from "./bifurcated-portfolio-utils";
import { DINESH_CONFIG } from "./clients/dinesh";
import { ARWANI_CONFIG } from "./clients/arwani";
import { ASHWIN_CONFIG } from "./clients/ashwin";
import { DINESH_FROZEN_DATA, EMPTY_FROZEN_DATA } from "./bifurcated-portfolio-data";

export interface BifurcatedClientEntry {
  icode: string;
  qcode: string;
  displayName: string;
  config: ClientConfig;
  frozenData: FrozenSchemeData;
  hasNavBasedTotalPortfolio: boolean;
}

export const BIFURCATED_CLIENTS: BifurcatedClientEntry[] = [
  {
    icode: "QUS00072",
    qcode: "QAC00053",
    displayName: "Dinesh",
    config: DINESH_CONFIG,
    frozenData: DINESH_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },
  {
    icode: "QUS00085",
    qcode: "QAC00071",
    displayName: "Arwani",
    config: ARWANI_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },
  {
    icode: "QUS00097",
    qcode: "QAC00083",
    displayName: "Ashwin Agarwal",
    config: ASHWIN_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },
];

export function findByIcode(icode: string): BifurcatedClientEntry | undefined {
  return BIFURCATED_CLIENTS.find((c) => c.icode === icode);
}

export function findByQcode(qcode: string): BifurcatedClientEntry | undefined {
  return BIFURCATED_CLIENTS.find((c) => c.qcode === qcode);
}
```

Array (not `Record`) chosen because N is small (5–20), insertion order is meaningful for readability, and iteration is needed for the validator script.

`hasNavBasedTotalPortfolio` is surfaced as explicit data because today's dashboard derives it as `isDinesh || isArwani || isAshwin` — a ternary fan-out that's easy to miss when adding a client.

### `defineBifurcatedClient` helper (in `app/lib/bifurcated-portfolio-utils.ts`)

A builder for the **Arwani/Ashwin/Mangesh pattern**: two-or-more parallel active schemes, no inactive scheme, `qodeTotalPortfolioTag: "Qode Total Portfolio"`. The helper's input shape mirrors the data team's tag-spec vocabulary.

```ts
interface DefineBifurcatedClientInput {
  name: string;
  qcode: string;
  schemes: Record<string, {
    inceptionDate: string;        // YYYY-MM-DD
    exposure: string;             // system_tag for current/metrics
    profit: string;               // system_tag for nav
  }>;
  // Optional overrides (rarely needed):
  qodeTotalPortfolioTag?: string;  // defaults to "Qode Total Portfolio"
  accountCode?: string;            // defaults to "" (field is vestigial for this code path)
}

export function defineBifurcatedClient(input: DefineBifurcatedClientInput): ClientConfig;
```

The helper internally:
- Sets `oldSchemeName: "__no_old_scheme__"`, `oldSchemeDepositTag: "__no_old_deposit_tag__"`, `oldSchemeNavTag: "__no_old_nav_tag__"`, `oldFinalNav: 100` (sentinels for the no-inactive-scheme pattern).
- Picks the **first** scheme in the `schemes` object as `newSchemeName`; derives `newStartDate`, `depositSystemTag`, `navSystemTag` from it.
- Adds a `"Total Portfolio"` entry to `portfolioMapping`.
- For each scheme, builds the verbose `PortfolioConfig` entry: `current: exposure`, `metrics: exposure`, `nav: profit`, `isActive: true`, `tags: { depositTag: exposure, navTag: profit, startDate }`.

**Verbose `ClientConfig` remains exported** for clients that don't fit this pattern (Dinesh, Shilpa, Vikram).

### Per-client config files

**`app/lib/clients/ashwin.ts`** (post-refactor):

```ts
import { defineBifurcatedClient } from "../bifurcated-portfolio-utils";

export const ASHWIN_CONFIG = defineBifurcatedClient({
  name: "Ashwin Agarwal",
  qcode: "QAC00083",
  schemes: {
    "Scheme QYE++": {
      inceptionDate: "2026-02-24",
      exposure: "QYE++ Zerodha Total Portfolio",
      profit:   "QYE++ Total Portfolio Value",
    },
    "Scheme QAW++": {
      inceptionDate: "2026-05-04",
      exposure: "QAW++ Zerodha Total Portfolio",
      profit:   "QAW++ Zerodha Total Portfolio",
    },
  },
});
```

**`app/lib/clients/arwani.ts`** — same shape with Arwani's values; migrated from the verbose form in commit 1.

**`app/lib/clients/dinesh.ts`** — stays verbose because Dinesh has an inactive QTF scheme with `displayAmountInvestedAsZero: true` flag and uses `DINESH_FROZEN_DATA`. The helper doesn't cover this shape; the verbose `ClientConfig` is the escape hatch.

**`app/lib/clients/shilpa.ts`** and **`app/lib/clients/vikram.ts`** — stay verbose; migrated from the existing inline constants for file-organization consistency.

### Engine instance cache (in `app/lib/bifurcated-portfolio-utils.ts`)

Replaces today's five module-level engine constants with a registry-driven map for the 3 registered clients. Shilpa and Vikram keep their own module-level constants (they are not in the registry).

```ts
import { BIFURCATED_CLIENTS } from "./bifurcated-clients-registry";

const engineByQcode: Map<string, BifurcatedPortfolioEngine> = new Map(
  BIFURCATED_CLIENTS.map((c) => [
    c.qcode,
    new BifurcatedPortfolioEngine(c.config, c.frozenData),
  ])
);

export function getEngineForQcode(qcode: string): BifurcatedPortfolioEngine | null {
  return engineByQcode.get(qcode) ?? null;
}
```

Module load constructs each engine once. Stateless after construction. Duplicate qcode entries in the registry throw on insert via TypeScript and surface via the validator script.

### Backward-compat shim exports

In `bifurcated-portfolio-utils.ts`:

```ts
// Backward-compat shims. distributor-utils.ts:795 still calls DineshApi.GET.
// These delegate to the registry-driven engine map. Remove once distributor-utils migrates.
export const DineshApi = { GET: (req: Request) => engineByQcode.get("QAC00053")!.handleGET(req) };
export const ArwaniApi = { GET: (req: Request) => engineByQcode.get("QAC00071")!.handleGET(req) };
export const AshwinApi = { GET: (req: Request) => engineByQcode.get("QAC00083")!.handleGET(req) };

// Legacy clients keep their own engines; shims unchanged in shape.
export const ShilpaApi = { GET: (req: Request) => shilpaEngine.handleGET(req) };
export const VikramApi = { GET: (req: Request) => vikramEngine.handleGET(req) };
```

### Auth helper (`app/lib/bifurcated-auth.ts`)

Shared by both parameterized routes.

```ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getEffectiveIcode } from "./admin-utils";
import { findByQcode, type BifurcatedClientEntry } from "./bifurcated-clients-registry";

export type AuthResult =
  | { ok: true; client: BifurcatedClientEntry }
  | { ok: false; response: NextResponse };

export async function authorizeBifurcatedRequest(req: Request): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const effectiveIcode = getEffectiveIcode(session);
  if (!effectiveIcode) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const url = new URL(req.url);
  const qcode = url.searchParams.get("qcode");
  if (!qcode) {
    return { ok: false, response: NextResponse.json({ error: "Missing qcode" }, { status: 400 }) };
  }
  const client = findByQcode(qcode);
  if (!client) {
    return { ok: false, response: NextResponse.json({ error: "Unknown client" }, { status: 404 }) };
  }
  if (client.icode !== effectiveIcode) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, client };
}
```

### `/api/bifurcated-portfolio/route.ts`

```ts
import { NextResponse } from "next/server";
import { authorizeBifurcatedRequest } from "@/app/lib/bifurcated-auth";
import { getEngineForQcode } from "@/app/lib/bifurcated-portfolio-utils";

export async function GET(req: Request) {
  const auth = await authorizeBifurcatedRequest(req);
  if (!auth.ok) return auth.response;
  const engine = getEngineForQcode(auth.client.qcode);
  if (!engine) return NextResponse.json({ error: "Engine not found" }, { status: 500 });
  return engine.handleGET(req);
}
```

### `/api/bifurcated-holdings/route.ts`

Structurally identical to today's `app/api/arwani-holdings-api/route.ts`, but the icode/qcode constants are replaced with values from `auth.client`. ~190 lines total. Replaces the 3 × 183-line per-client holdings routes.

All Prisma calls remain `findFirst` / `findMany` on `bifurcated_equity_holding_test` and `bifurcated_mutual_fund_holding_sheet_test`. Response shape unchanged: `{ holdingsSummary, availableStrategies, dataAsOfDate }`.

### Frontend changes

**`app/dashboard/page.tsx`**:
- `findByIcode(effectiveIcode)` returns the entry or `undefined`.
- `isBifurcatedClient = !!entry || isShilpaLegacy || isVikramLegacy`.
- `bifurcatedConfig`, broker label, error label, `hasNavBasedTotalPortfolio` all read from `entry` when present, else fall through to the Shilpa/Vikram legacy branch.
- The previous 5 ternary fan-outs collapse into one registry lookup + a 2-branch legacy fallback.

**`app/holding-summary/page.tsx`**:
- Three fetchers (`fetchArwaniHoldings`, `fetchDineshHoldings`, `fetchAshwinHoldings`) replaced by one `fetchBifurcatedHoldings(entry)` that builds the URL as `/api/bifurcated-holdings?qcode=${entry.qcode}`.
- Dispatch chain: `if (entry) fetchBifurcatedHoldings(entry); else if (isSarla||isSatidham) ...; else fetchAccounts();`.
- Behavior for Shilpa/Vikram preserved (today they have no holdings view; they still have none after the refactor).

### Investigation script (`scripts/investigate-bifurcated-client.ts`)

Generalized from `scripts/investigate-ashwin-data.ts`. Usage:

```
npx ts-node scripts/investigate-bifurcated-client.ts <qcode> [name-search]
```

Output sections:
1. Client identity (icode, name, qcode from `clients` + `accounts` + `pooled_account_users`).
2. Distinct `system_tag` values in `bifurcated_master_sheet_test` for the qcode.
3. Detected scheme tags (heuristically — anything matching `^(QYE|QAW|QTF)\+\+ ` patterns).
4. Per scheme: `MIN(date)`, `MAX(date)`, row count, sample first/last NAV.
5. `Qode Total Portfolio` presence check.
6. Cash-flow column populated check per scheme.
7. Holdings presence in `bifurcated_equity_holding_test` and `bifurcated_mutual_fund_holding_sheet_test`.
8. **PASTE-READY CONFIG BLOCK** — a `defineBifurcatedClient({...})` skeleton listing each detected scheme with its DB-derived `inceptionDate` filled in. Both `exposure` and `profit` fields are emitted as `<FILL_FROM_DATA_TEAM>` placeholders — the data team's message is the source of truth for tag-to-scheme mapping; the script does not guess.
9. **PASTE-READY REGISTRY ENTRY** — full entry with icode/qcode/displayName/frozenData/`hasNavBasedTotalPortfolio: true`.

Scheme detection heuristic: enumerate distinct `system_tag` values where the qcode has rows, group by leading `<SCHEME>++ ` prefix tokens, and emit one paste-ready entry per detected prefix. If the heuristic misses a scheme (e.g., a scheme without the `++ ` convention), the teammate can hand-add it; the runbook documents this fallback.

All queries are READ-ONLY (`findMany`, `findFirst`, `count`).

### Validator script (`scripts/validate-bifurcated-registry.ts`)

Iterates `BIFURCATED_CLIENTS` and for each entry confirms:
- icode exists in `clients` table.
- qcode exists in `accounts` table.
- For each scheme in the config's `portfolioMapping` (excluding `"Total Portfolio"`):
  - Per-scheme deposit/nav tags have data in `bifurcated_master_sheet_test`.
  - The scheme's `startDate` matches `MIN(date)` for its deposit tag (within ±1 day tolerance for timezone safety).
- `qodeTotalPortfolioTag` (if set) has rows in `bifurcated_master_sheet_test`.
- No duplicate qcodes across entries (registry integrity).

Exits 0 on success, 1 on any violation. All queries READ-ONLY.

### Runbook (`docs/how-to-add-a-bifurcated-client.md`)

Documents the 6-step workflow:

1. Receive the data team's tag spec for the new client.
2. Run `npx ts-node scripts/investigate-bifurcated-client.ts <qcode> [name-search]`.
3. Create `app/lib/clients/<name>.ts`; paste the config block; fill in the two profit tags from the data team's message.
4. Append the registry entry to `app/lib/bifurcated-clients-registry.ts`.
5. Run `npx ts-node scripts/validate-bifurcated-registry.ts` — must exit 0.
6. `npm run build` (must exit 0); commit; push.

Includes a sample Prisma Studio screenshot showing what "cash flows populated" looks like in `bifurcated_master_sheet_test`.

## Commit Plan (Strangler-Fig)

| # | Commit | Net change | Reversible |
|---|---|---|---|
| 1 | **Build the new pattern (additive only).** Add `bifurcated-clients-registry.ts`, `bifurcated-auth.ts`, `app/lib/clients/*.ts` (5 files), `/api/bifurcated-portfolio`, `/api/bifurcated-holdings`, both scripts, the runbook. Modify `bifurcated-portfolio-utils.ts` to add `defineBifurcatedClient`, replace per-client engine constants with `engineByQcode` map (for the 3 registered clients only), update `*Api` shims to delegate via the map, remove inline `*_CONFIG` constants (now imported from `app/lib/clients/`). Old per-client URL routes still live. | Yes |
| 2 | **Repoint frontend.** Modify `app/dashboard/page.tsx` and `app/holding-summary/page.tsx` to read from the registry instead of per-client ternaries / fetchers. Old URL routes still live but unreferenced. | Yes |
| 3 | **Delete the dead per-client URL routes.** Remove 6 files: `app/api/{dinesh,arwani,ashwin}-api/route.ts` and `app/api/{dinesh,arwani,ashwin}-holdings-api/route.ts`. `*Api` shim exports stay in `bifurcated-portfolio-utils.ts`. | Yes |

Between commit 1 and commit 2, both the old and new URLs serve identical JSON for the 3 bifurcated clients — that's the regression contract. After commit 2, the frontend is on the new routes but the old routes remain callable (useful for ad-hoc debugging). Commit 3 finalizes the cleanup.

## Risks

1. **Dashboard ternary collapse must preserve behavior across all 5 bifurcated-engine clients.** Verification: log in as each of Dinesh/Arwani/Ashwin/Shilpa/Vikram; dashboards must render identically before and after commit 2. The Shilpa/Vikram legacy branch is explicitly preserved.

2. **`*Api` shim correctness.** The shims look up engines by hardcoded qcode (`"QAC00053"`, etc.). If a registry entry is removed without removing the corresponding shim, the shim's non-null assertion fails. This is intentional (loud failure beats silent breakage); the runbook calls out to update both registry and shim atomically when retiring a client.

3. **`distributor-utils.ts` regression risk.** It calls `DineshApi.GET(fakeReq)` server-side. Verification: load whichever UI page exercises the distributor view; confirm Dinesh's data appears.

4. **New auth check is stricter than old portfolio routes.** Today, hitting `/api/dinesh-api?qcode=QAC00071` (mismatched qcode) would run Dinesh's engine against Arwani's qcode — wrong data, but no 403. After refactor, `/api/bifurcated-portfolio?qcode=QAC00071` while logged in as Dinesh returns 403. Net security improvement. **Need to grep for any internal tool / admin script exploiting the loose behavior** before commit 3 — none found in the codebase today.

5. **Registry initialization order.** Module load constructs all engines once from `BIFURCATED_CLIENTS`. A malformed entry (missing `config` or `frozenData` import) fails at build time, not runtime — TypeScript catches it.

## Verification Plan

**Automated (CI gates), run after each commit:**

- `npm run build` exits 0.
- `npm run lint` exits 0 on changed files.
- `grep -rE "prisma\.[a-zA-Z_]+\.(create|createMany|update|updateMany|delete|deleteMany|upsert)|\\\$executeRaw"` on all added/modified files — zero matches.
- `npx ts-node scripts/validate-bifurcated-registry.ts` exits 0 after commit 1.

**Manual (operator), after commit 1:**

- For each of `QAC00053` / `QAC00071` / `QAC00083`: hit `/api/bifurcated-portfolio?qcode=<qcode>` and `/api/<name>-api?qcode=<qcode>` side by side; JSON responses must be deep-equal.
- Same exercise for `/api/bifurcated-holdings?qcode=<qcode>` vs `/api/<name>-holdings-api`.

**Manual (operator), after commit 2:**

- Load `/dashboard` and `/holding-summary` as each of Dinesh / Arwani / Ashwin — confirms registry-backed path works.
- Load `/dashboard` as Shilpa / Vikram — confirms legacy path preserved.
- Spot-check Sarla / Satidham / PMS / regular-managed clients — confirms unrelated flows untouched.
- Load the distributor view — confirms `DineshApi` shim works.

**Manual (operator), after commit 3:**

- Hit one deleted URL (`/api/dinesh-api?qcode=QAC00053`) — must return 404 (route file removed).
- Repeat the full client-view sweep — everything still loads.

## Future Work (Explicitly Deferred)

- Migrate Shilpa/Vikram to the registry once their data lives in `bifurcated_master_sheet_test`. At that point: move their `ClientConfig` from verbose to `defineBifurcatedClient` if their shape fits, add to registry, delete their per-client routes. ~1 commit.
- Refactor `distributor-utils.ts` to call the parameterized API directly; delete the `*Api` shim exports.
- Delete `app/lib/arwani-portfolio-utils.ts` (legacy unused).
- Consider adding a `DELETE`-style admin endpoint that wipes engine cache for a qcode (useful for hot config swaps, not needed today).
