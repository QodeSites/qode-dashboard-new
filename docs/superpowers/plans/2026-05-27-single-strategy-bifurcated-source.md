# Single-Strategy from Bifurcated Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let registry-listed single-strategy managed accounts (first: GRD / `QAC00092`) source portfolio data from `bifurcated_master_sheet_test` while rendering through the existing no-dropdown single-strategy dashboard path.

**Architecture:** Add a `defineSingleStrategyClient` helper that builds a one-scheme `ClientConfig` with no "Total Portfolio" aggregate; tag the registry entry with `renderMode: "single"` + a `broker` field; the dashboard detects these clients, fetches `/api/bifurcated-portfolio`, unwraps the single scheme's `Stats` into the existing `stats` state, and renders via the existing single-strategy JSX (no dropdown). Reuses the `BifurcatedPortfolioEngine` (already reads the bifurcated table) and the existing single-strategy render path.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Prisma (PostgreSQL), NextAuth.js.

**Spec:** `docs/superpowers/specs/2026-05-27-single-strategy-bifurcated-source-design.md`

**Database safety:** All changes are config + frontend + a pure builder function. No new Prisma operations. The reused engine + route are already SELECT-only.

**Testing note:** No automated test suite for this path. Each task uses `npm run build` as the type gate plus a `tsx` smoke test for the helper, the registry validator for config correctness, and a manual side-by-side parity check for the render (per the spec's Risk A — there is no identical-JSON contract here because GRD switches from one engine to a different engine).

---

## Task 1: Add `defineSingleStrategyClient` helper

**Files:**
- Modify: `app/lib/bifurcated-client-builder.ts`

This adds a sibling to `defineBifurcatedClient` that builds a one-scheme config with NO "Total Portfolio" aggregate entry.

- [ ] **Step 1: Add the input interface + helper after `defineBifurcatedClient`**

Read `app/lib/bifurcated-client-builder.ts` to find the end of the `defineBifurcatedClient` function (it ends with a closing `}` after the `return { ... }` block, around line 130). Use `Edit` to insert the new code immediately after that closing brace.

`old_string` (the final lines of `defineBifurcatedClient` — read the file to confirm the exact closing text; it ends with the return object's closing and the function's closing brace):
```ts
    qodeTotalPortfolioTag:
      input.qodeTotalPortfolioTag ?? "Qode Total Portfolio",
    portfolioMapping,
  };
}
```

`new_string`:
```ts
    qodeTotalPortfolioTag:
      input.qodeTotalPortfolioTag ?? "Qode Total Portfolio",
    portfolioMapping,
  };
}

// ==================== Helper: defineSingleStrategyClient ====================
// Builds a ClientConfig for a SINGLE-strategy client whose data lives in
// bifurcated_master_sheet_test but which must render in the existing
// single-strategy dashboard format (NO strategy dropdown, no "Total
// Portfolio" aggregate). Produces exactly one scheme key in
// portfolioMapping. qodeTotalPortfolioTag is set only to route the engine's
// msTable getter to bifurcated_master_sheet_test — because there is no
// "Total Portfolio" key in the mapping, the engine's aggregate code paths
// never run, and handleGET returns a single keyed entry.
//
// Use defineBifurcatedClient (not this) for multi-scheme clients that need
// the dropdown + Total Portfolio aggregate.

export interface DefineSingleStrategyClientInput {
  name: string;
  qcode: string;
  strategyName: string;   // the single scheme's display label, e.g. "QYE++"
  inceptionDate: string;  // YYYY-MM-DD
  exposure: string;       // system_tag for current value / deposit / metrics
  profit: string;         // system_tag for the NAV curve
  // Optional overrides — rarely needed.
  qodeTotalPortfolioTag?: string; // default "Qode Total Portfolio" (table routing only)
  accountCode?: string;            // default "" (vestigial)
}

export function defineSingleStrategyClient(
  input: DefineSingleStrategyClientInput
): ClientConfig {
  const portfolioMapping: Record<string, PortfolioConfig> = {
    // NOTE: no "Total Portfolio" entry — exactly one scheme key, so the
    // engine returns a single response key and the frontend renders it via
    // the no-dropdown single-strategy path.
    [input.strategyName]: {
      current: input.exposure,
      metrics: input.exposure,
      nav: input.profit,
      isActive: true,
      tags: {
        depositTag: input.exposure,
        navTag: input.profit,
        startDate: new Date(input.inceptionDate),
      },
    },
  };

  return {
    clientName: input.name,
    defaultQcode: input.qcode,
    accountCode: input.accountCode ?? "",
    oldSchemeName: "__no_old_scheme__",
    newSchemeName: input.strategyName,
    oldFinalNav: 100,
    newStartDate: new Date(input.inceptionDate),
    depositSystemTag: input.exposure,
    navSystemTag: input.exposure,
    oldSchemeDepositTag: "__no_old_deposit_tag__",
    oldSchemeNavTag: "__no_old_nav_tag__",
    qodeTotalPortfolioTag:
      input.qodeTotalPortfolioTag ?? "Qode Total Portfolio",
    portfolioMapping,
  };
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0. The helper is unused at this point; TypeScript accepts it if the body type-checks.

- [ ] **Step 3: Smoke-test the helper output**

Create a temp script INSIDE the project (so `@prisma/client` resolves — `/tmp` won't):

```bash
cat > scripts/_tmp-single-smoke.ts << 'EOF'
import { defineSingleStrategyClient } from "../app/lib/bifurcated-client-builder";

const cfg = defineSingleStrategyClient({
  name: "GRD",
  qcode: "QAC00092",
  strategyName: "QYE++",
  inceptionDate: "2026-03-11",
  exposure: "QYE++ Total Portfolio Exposure",
  profit: "QYE++ Total Portfolio Exposure",
});

const keys = Object.keys(cfg.portfolioMapping);
console.log("portfolioMapping keys:", JSON.stringify(keys));
console.log("has Total Portfolio key:", keys.includes("Total Portfolio"));
console.log("scheme key count:", keys.length);
const s = cfg.portfolioMapping["QYE++"];
console.log("QYE++ current:", s.current);
console.log("QYE++ nav:", s.nav);
console.log("QYE++ isActive:", s.isActive);
console.log("QYE++ tags.startDate:", s.tags?.startDate?.toISOString().split("T")[0]);
console.log("qodeTotalPortfolioTag:", cfg.qodeTotalPortfolioTag);
console.log("newSchemeName:", cfg.newSchemeName);
EOF
npx tsx scripts/_tmp-single-smoke.ts; rm scripts/_tmp-single-smoke.ts
```

Expected output:
```
portfolioMapping keys: ["QYE++"]
has Total Portfolio key: false
scheme key count: 1
QYE++ current: QYE++ Total Portfolio Exposure
QYE++ nav: QYE++ Total Portfolio Exposure
QYE++ isActive: true
QYE++ tags.startDate: 2026-03-11
qodeTotalPortfolioTag: Qode Total Portfolio
newSchemeName: QYE++
```

If `has Total Portfolio key` is `true` or `scheme key count` ≠ 1, the helper is wrong — fix before committing.

- [ ] **Step 4: Commit**

```bash
git add app/lib/bifurcated-client-builder.ts
git commit -m "feat(bifurcated): add defineSingleStrategyClient helper (one scheme, no Total Portfolio)"
```

---

## Task 2: Add `renderMode`/`broker` to registry, create GRD config, register GRD

**Files:**
- Create: `app/lib/clients/grd.ts`
- Modify: `app/lib/bifurcated-clients-registry.ts`

- [ ] **Step 1: Create `app/lib/clients/grd.ts`**

Use `Write`:
```ts
import { defineSingleStrategyClient } from "../bifurcated-client-builder";

// GRD: single-strategy managed/Radiance account sourced from
// bifurcated_master_sheet_test. Renders in the no-dropdown single-strategy
// format (renderMode: "single" in the registry). Radiance convention uses
// the "Total Portfolio Exposure" tag for both exposure and profit.
export const GRD_CONFIG = defineSingleStrategyClient({
  name: "GRD",
  qcode: "QAC00092",
  strategyName: "QYE++",
  inceptionDate: "2026-03-11",
  exposure: "QYE++ Total Portfolio Exposure",
  profit: "QYE++ Total Portfolio Exposure",
});
```

- [ ] **Step 2: Extend `BifurcatedClientEntry` with `renderMode` + `broker`**

Use `Edit` on `app/lib/bifurcated-clients-registry.ts`. `old_string`:
```ts
export interface BifurcatedClientEntry {
  icode: string;
  qcode: string;
  displayName: string;
  config: ClientConfig;
  frozenData: FrozenSchemeData;
  hasNavBasedTotalPortfolio: boolean;
}
```

`new_string`:
```ts
export interface BifurcatedClientEntry {
  icode: string;
  qcode: string;
  displayName: string;
  config: ClientConfig;
  frozenData: FrozenSchemeData;
  hasNavBasedTotalPortfolio: boolean;
  // "multi" (default, when absent) = dropdown render with Total Portfolio +
  // per-scheme views. "single" = no dropdown; the dashboard unwraps the one
  // scheme into the existing single-strategy render path.
  renderMode?: "multi" | "single";
  // Only used for renderMode: "single" clients — supplies the StatsCards
  // broker label, since these clients bypass /api/accounts (which is where
  // multi-account/regular clients get their broker from).
  broker?: string;
}
```

- [ ] **Step 3: Add the GRD import + registry entry**

Use `Edit`. First add the import. `old_string` (read the registry file to confirm the exact import block — it imports each client config):
```ts
import { SHILPA_PODDAR_CONFIG } from "./clients/shilpa";
import { SURESH_SOMANI_CONFIG } from "./clients/suresh";
import { VIKRAM_TRADING_COMPANY_CONFIG } from "./clients/vikram";
```

`new_string`:
```ts
import { SHILPA_PODDAR_CONFIG } from "./clients/shilpa";
import { SURESH_SOMANI_CONFIG } from "./clients/suresh";
import { VIKRAM_TRADING_COMPANY_CONFIG } from "./clients/vikram";
import { GRD_CONFIG } from "./clients/grd";
```

(If the exact set/order of imports differs when you read the file, just add the `GRD_CONFIG` import line alongside the others.)

- [ ] **Step 4: Append the GRD entry to `BIFURCATED_CLIENTS`**

Use `Edit`. Find the closing `];` of the `BIFURCATED_CLIENTS` array (the last entry is currently Vikram). `old_string` (read the file to confirm the exact final entry + closing bracket):
```ts
  {
    icode: "QUS00068",
    qcode: "QAC00043",
    displayName: "Vikram Trading Company",
    config: VIKRAM_TRADING_COMPANY_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },
];
```

`new_string`:
```ts
  {
    icode: "QUS00068",
    qcode: "QAC00043",
    displayName: "Vikram Trading Company",
    config: VIKRAM_TRADING_COMPANY_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },
  {
    icode: "QUS00106",
    qcode: "QAC00092",
    displayName: "GRD",
    config: GRD_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "radiance",
  },
];
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Run the registry validator**

Run: `npx tsx scripts/validate-bifurcated-registry.ts`
Expected: exit 0, `✓ Registry valid`. The GRD entry should report:
- `icode found in clients: "GRD"`
- `qcode found in accounts: "GRD"`
- `Scheme QYE++: inception 2026-03-11 matches DB MIN 2026-03-11` (the validator iterates `portfolioMapping` excluding "Total Portfolio"; GRD has one scheme "QYE++" with a deposit tag of `QYE++ Total Portfolio Exposure`)
- `"Qode Total Portfolio" present (51 rows)`

If the validator errors because it assumes a "Total Portfolio" key exists, STOP and report — the validator needs a fix (it should already be safe: it skips `"Total Portfolio"` and only checks schemes that have `tags`).

- [ ] **Step 7: Commit**

```bash
git add app/lib/clients/grd.ts app/lib/bifurcated-clients-registry.ts
git commit -m "feat(bifurcated): register GRD as single-strategy client (renderMode: single)"
```

---

## Task 3: Dashboard detection + single-strategy fetch branch

**Files:**
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Split the detection so single-strategy clients are NOT `isBifurcatedClient`**

Use `Edit`. `old_string`:
```ts
  // Registry-driven for all bifurcated_master_sheet_test clients.
  const bifurcatedClient = findByIcode(effectiveIcode);
  const isBifurcatedClient = !!bifurcatedClient;
```

`new_string`:
```ts
  // Registry-driven for all bifurcated_master_sheet_test clients.
  const bifurcatedClient = findByIcode(effectiveIcode);
  // Single-strategy clients (renderMode: "single") render through the
  // existing no-dropdown single-strategy path, NOT the dropdown bifurcated
  // path — so they are deliberately excluded from isBifurcatedClient.
  const isSingleStrategyBifurcated = bifurcatedClient?.renderMode === "single";
  const isBifurcatedClient = !!bifurcatedClient && !isSingleStrategyBifurcated;
```

- [ ] **Step 2: Add a fetch branch for single-strategy clients in the first `useEffect`**

Use `Edit`. The first `useEffect` has the `else if (isBifurcatedClient && bifurcatedClient) { ... fetchBifurcatedData() ... }` branch followed by the final `else { ... fetchAccounts() ... }`. Insert a new branch between them.

`old_string`:
```ts
        fetchBifurcatedData();
      } else {
        const fetchAccounts = async () => {
```

`new_string`:
```ts
        fetchBifurcatedData();
      } else if (isSingleStrategyBifurcated && bifurcatedClient) {
        // Single-strategy bifurcated client: fetch the same parameterized
        // route, but the response has exactly one scheme key. Unwrap it into
        // the `stats`/`metadata` state so the existing single-strategy render
        // path (no dropdown) displays it.
        const ssClient = bifurcatedClient;
        const fetchSingleStrategyData = async () => {
          try {
            const res = await fetch(`/api/bifurcated-portfolio?qcode=${ssClient.qcode}`, { credentials: "include" });
            if (!res.ok) {
              const errorData = await res.json();
              throw new Error(errorData.error || `Failed to load ${ssClient.displayName} data`);
            }
            const data: SarlaApiResponse = await res.json();
            const entry = Object.values(data)[0];
            if (!entry?.data) {
              throw new Error(`No scheme data returned for ${ssClient.displayName}`);
            }
            setStats(entry.data as Stats);
            setMetadata(entry.metadata ?? null);
            setIsLoading(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : `An unexpected error occurred`);
            setIsLoading(false);
          }
        };

        fetchSingleStrategyData();
      } else {
        const fetchAccounts = async () => {
```

- [ ] **Step 3: Add `isSingleStrategyBifurcated` to the first `useEffect` dependency array**

Use `Edit`. `old_string`:
```ts
  }, [status, router, isSarla, isSatidham, isBifurcatedClient, accountCode, isAdmin, isImpersonating]);
```

`new_string`:
```ts
  }, [status, router, isSarla, isSatidham, isBifurcatedClient, isSingleStrategyBifurcated, accountCode, isAdmin, isImpersonating]);
```

- [ ] **Step 4: Guard the regular portfolio-fetch `useEffect` against single-strategy clients**

This is defensive — the second `useEffect` only runs when `selectedAccount` is truthy, and single-strategy clients never set `selectedAccount`. But make the exclusion explicit. Use `Edit`. `old_string`:
```ts
    if (selectedAccount && status === "authenticated" && !isSarla && !isSatidham && !isBifurcatedClient) {
```

`new_string`:
```ts
    if (selectedAccount && status === "authenticated" && !isSarla && !isSatidham && !isBifurcatedClient && !isSingleStrategyBifurcated) {
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: exit 0. If TypeScript complains that `SarlaApiResponse` or `Stats` or `setMetadata` is not in scope, confirm those identifiers exist in the file (they do — `SarlaApiResponse` is used by the bifurcated branch above, `Stats` is imported, `setMetadata` is the metadata state setter). If `Object.values(data)[0]` types as `unknown`, cast the entry as needed (e.g. `const entry = Object.values(data)[0] as { data: Stats; metadata: Metadata | null }`).

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(bifurcated): dashboard fetch path for single-strategy clients"
```

---

## Task 4: Single-strategy render — account-context fallback to registry

**Files:**
- Modify: `app/dashboard/page.tsx`

The single-strategy render branch (`~:1568-1575`) reads broker/account_type from `accounts.find((acc) => acc.qcode === selectedAccount)`. For single-strategy bifurcated clients, `accounts` is empty and `selectedAccount` is null, so these resolve to `"unknown"`/`"Unknown"`. Add a registry-backed fallback.

- [ ] **Step 1: Add the fallback on the `<StatsCards>` props in the single-strategy branch**

Use `Edit`. `old_string`:
```ts
                      <StatsCards
                        stats={convertedStats}
                        accountType={accounts.find((acc) => acc.qcode === selectedAccount)?.account_type || "unknown"}
                        broker={accounts.find((acc) => acc.qcode === selectedAccount)?.broker || "Unknown"}
                        isActive={metadata?.isActive ?? true}
                        returnViewType={returnViewType}
                        setReturnViewType={setReturnViewType}
                      />
```

`new_string`:
```ts
                      <StatsCards
                        stats={convertedStats}
                        accountType={
                          isSingleStrategyBifurcated
                            ? "managed_account"
                            : accounts.find((acc) => acc.qcode === selectedAccount)?.account_type || "unknown"
                        }
                        broker={
                          isSingleStrategyBifurcated
                            ? bifurcatedClient?.broker || "Unknown"
                            : accounts.find((acc) => acc.qcode === selectedAccount)?.broker || "Unknown"
                        }
                        isActive={metadata?.isActive ?? true}
                        returnViewType={returnViewType}
                        setReturnViewType={setReturnViewType}
                      />
```

(`accountType` is hardcoded to `"managed_account"` for single-strategy clients because `StatsCards.getCardLabels` only special-cases `account_type === 'managed_account' && broker === 'jainam'`; GRD is `radiance`, so it gets the default labels — which is the correct single-strategy presentation.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(bifurcated): single-strategy render uses registry broker/account-type fallback"
```

---

## Task 5: Verification

**Files:** none modified — gates only.

- [ ] **Step 1: Full build + read-only audit**

Run:
```bash
npm run build
git diff main...HEAD --name-only -- 'app/**/*.ts' 'app/**/*.tsx' | xargs grep -nE "prisma\.[a-zA-Z_]+\.(create|createMany|update|updateMany|delete|deleteMany|upsert)|\\\$executeRaw" 2>/dev/null || echo "OK — no write operations found"
```
Expected: build exit 0; audit prints `OK — no write operations found`.

- [ ] **Step 2: Registry validator**

Run: `npx tsx scripts/validate-bifurcated-registry.ts`
Expected: exit 0, `✓ Registry valid` — all entries including GRD.

- [ ] **Step 3: API smoke test (manual, requires login)**

Start the dev server (`npm run dev`). Logged in as GRD (`QUS00106`) or via curl with session cookie:
- GET `http://localhost:2030/api/bifurcated-portfolio?qcode=QAC00092`
- Expected: a JSON object with exactly ONE key (`"QYE++"`), no `"Total Portfolio"` key. The entry has `.data` (Stats-shaped) and `.metadata`.

- [ ] **Step 4: Render check — single-strategy format (manual)**

Log into the dashboard as GRD (`QUS00106`):
- Confirm **NO strategy dropdown** is shown.
- Confirm the view renders StatsCards + RevenueChart + PnlTable + CashFlows — identical layout to a regular managed account.
- Confirm the broker label / StatsCards labels look correct (default "Amount Invested" / "Current Portfolio Value" / "Returns" labels, not the Jainam variants).

- [ ] **Step 5: Parity check vs current production view (manual — the important one, per spec Risk A)**

GRD is switching from `ZerodhaManagedStrategy` (master_sheet) to `BifurcatedPortfolioEngine` (bifurcated_master_sheet_test) — two different engines, no identical-JSON contract. Compare the new local view against the current production view for GRD:
- Amount Invested, Current Portfolio Value, Returns (%), Max Drawdown, since-inception return, NAV curve shape.
- If numbers differ, decide (with the account owner) whether `bifurcated_master_sheet_test` is the new authoritative source. Document the decision. This is a judgment call, not a hard pass/fail.

- [ ] **Step 6: Regression check (manual)**

- Log in as a multi-scheme bifurcated client (e.g. Arwani `QUS00085`) — confirm the dropdown still appears and all schemes render (renderMode defaults to "multi", behavior unchanged).
- Log in as a regular single-strategy account (one NOT in the registry) — confirm it still loads via `/api/portfolio` unchanged.
- Spot-check Sarla/Satidham load normally.

- [ ] **Step 7: Final commit (only if fixes were needed in Steps 1–6)**

```bash
git add <fixed files>
git commit -m "fix(bifurcated): <what was fixed>"
```

---

## File Structure Summary

| Path | Action | Purpose |
|---|---|---|
| `app/lib/bifurcated-client-builder.ts` | Modify | Add `defineSingleStrategyClient` + `DefineSingleStrategyClientInput` |
| `app/lib/clients/grd.ts` | Create | GRD single-strategy config |
| `app/lib/bifurcated-clients-registry.ts` | Modify | Add `renderMode`/`broker` fields + GRD entry |
| `app/dashboard/page.tsx` | Modify | `isSingleStrategyBifurcated` detection, fetch branch, render account-context fallback |

No new routes, no engine changes, no DB writes, no holdings changes. Multi-scheme clients, Sarla/Satidham, and master_sheet-based single-strategy accounts are untouched.
