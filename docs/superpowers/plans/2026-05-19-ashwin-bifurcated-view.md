# Ashwin Agarwal Bifurcated View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Ashwin Agarwal (`icode=QUS00097`, `qcode=QAC00083`) into the existing `BifurcatedPortfolioEngine` so the dashboard surfaces three views — `Total Portfolio`, `Scheme QYE++`, `Scheme QAW++` — using the same mechanism that powers the Arwani view.

**Architecture:** Strictly additive. Add an `ASHWIN_CONFIG` to `app/lib/bifurcated-portfolio-utils.ts`, instantiate an engine + export an API handler, create two thin new route files, and extend five ternaries in `app/dashboard/page.tsx` + the dispatcher in `app/holding-summary/page.tsx`. No engine logic changes; no holdings-API logic changes; zero risk to Arwani/Dinesh/Shilpa/Vikram.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Prisma (PostgreSQL), NextAuth.js.

**Spec:** `docs/superpowers/specs/2026-05-19-ashwin-bifurcated-view-design.md`

**Testing note:** This codebase has no automated test suite for this code path (confirmed in the spec). Each task uses `npm run build` as the gate — TypeScript catches structural mistakes, and the spec's verification plan covers behavior with manual + DB checks (executed in Task 6).

---

## Task 1: Engine config + instance + API export

**Files:**
- Modify: `app/lib/bifurcated-portfolio-utils.ts`

This adds Ashwin's `ClientConfig`, instantiates the engine, and exports the API handler. Three small additive edits to one file.

- [ ] **Step 1: Read the file's existing structure**

Run: `Read app/lib/bifurcated-portfolio-utils.ts offset=270 limit=50` to confirm `ARWANI_CONFIG` is at lines 270–316 and ends with a closing `};`. Then `Read offset=1620 limit=25` to confirm the engine instance + API export block at lines 1622–1638.

- [ ] **Step 2: Append ASHWIN_CONFIG after ARWANI_CONFIG**

Use the `Edit` tool. `old_string` is the closing of `ARWANI_CONFIG` and the start of the next section:

```ts
    "Scheme QAW++": {
      current: "QAW++ Zerodha Total Portfolio",
      metrics: "QAW++ Zerodha Total Portfolio",
      nav: "QAW++ Zerodha Total Portfolio",
      isActive: true,
      tags: {
        depositTag: "QAW++ Zerodha Total Portfolio",
        navTag: "QAW++ Zerodha Total Portfolio",
        startDate: new Date("2026-03-23"),
      },
    },
  },
};

// ==================== Engine ====================
```

`new_string` (inserts `ASHWIN_CONFIG` between the closing of `ARWANI_CONFIG` and the `Engine` divider — preserves Arwani exactly):

```ts
    "Scheme QAW++": {
      current: "QAW++ Zerodha Total Portfolio",
      metrics: "QAW++ Zerodha Total Portfolio",
      nav: "QAW++ Zerodha Total Portfolio",
      isActive: true,
      tags: {
        depositTag: "QAW++ Zerodha Total Portfolio",
        navTag: "QAW++ Zerodha Total Portfolio",
        startDate: new Date("2026-03-23"),
      },
    },
  },
};

// Ashwin Agarwal: identical shape to Arwani — two parallel active schemes
// (QYE++ since 2026-02-24, QAW++ added 2026-05-04) and an authoritative
// Qode Total Portfolio aggregate curve. No inactive scheme.
const ASHWIN_CONFIG: ClientConfig = {
  clientName: "Ashwin Agarwal",
  defaultQcode: "QAC00083",
  accountCode: "AC13",
  oldSchemeName: "__no_old_scheme__",
  newSchemeName: "Scheme QYE++",
  oldFinalNav: 100,
  newStartDate: new Date("2026-02-24"),
  depositSystemTag: "QYE++ Zerodha Total Portfolio",
  navSystemTag: "QYE++ Zerodha Total Portfolio",
  oldSchemeDepositTag: "__no_old_deposit_tag__",
  oldSchemeNavTag: "__no_old_nav_tag__",
  qodeTotalPortfolioTag: "Qode Total Portfolio",
  portfolioMapping: {
    "Total Portfolio": {
      current: "Total Portfolio",
      metrics: "Total Portfolio",
      nav: "Total Portfolio",
      isActive: true,
    },
    "Scheme QYE++": {
      current: "QYE++ Zerodha Total Portfolio",
      metrics: "QYE++ Zerodha Total Portfolio",
      nav: "QYE++ Total Portfolio Value",
      isActive: true,
      tags: {
        depositTag: "QYE++ Zerodha Total Portfolio",
        navTag: "QYE++ Total Portfolio Value",
        startDate: new Date("2026-02-24"),
      },
    },
    "Scheme QAW++": {
      current: "QAW++ Zerodha Total Portfolio",
      metrics: "QAW++ Zerodha Total Portfolio",
      nav: "QAW++ Zerodha Total Portfolio",
      isActive: true,
      tags: {
        depositTag: "QAW++ Zerodha Total Portfolio",
        navTag: "QAW++ Zerodha Total Portfolio",
        startDate: new Date("2026-05-04"),
      },
    },
  },
};

// ==================== Engine ====================
```

- [ ] **Step 3: Add the engine instance after `arwaniEngine`**

Use `Edit`. `old_string`:

```ts
const arwaniEngine = new BifurcatedPortfolioEngine(
  ARWANI_CONFIG,
  EMPTY_FROZEN_DATA
);

export const DineshApi = {
```

`new_string`:

```ts
const arwaniEngine = new BifurcatedPortfolioEngine(
  ARWANI_CONFIG,
  EMPTY_FROZEN_DATA
);
const ashwinEngine = new BifurcatedPortfolioEngine(
  ASHWIN_CONFIG,
  EMPTY_FROZEN_DATA
);

export const DineshApi = {
```

- [ ] **Step 4: Add the `AshwinApi` export at the bottom of the file**

Use `Edit`. `old_string`:

```ts
export const ArwaniApi = {
  GET: (req: Request) => arwaniEngine.handleGET(req),
};
```

`new_string`:

```ts
export const ArwaniApi = {
  GET: (req: Request) => arwaniEngine.handleGET(req),
};
export const AshwinApi = {
  GET: (req: Request) => ashwinEngine.handleGET(req),
};
```

- [ ] **Step 5: Run the build**

Run: `npm run build`
Expected: exits 0. If TypeScript complains about `ClientConfig` field shapes, the new config drifted from the interface at `bifurcated-portfolio-utils.ts:102-125` — re-check field names against `DINESH_CONFIG` / `ARWANI_CONFIG`.

- [ ] **Step 6: Commit**

```bash
git add app/lib/bifurcated-portfolio-utils.ts
git commit -m "feat(ashwin): add ASHWIN_CONFIG, engine instance, and AshwinApi export"
```

---

## Task 2: Portfolio API route

**Files:**
- Create: `app/api/ashwin-api/route.ts`

A 3-line file that re-exports the API handler created in Task 1. Mirrors `app/api/arwani-api/route.ts` exactly.

- [ ] **Step 1: Create the route file**

Use the `Write` tool. Contents:

```ts
import { AshwinApi } from '@/app/lib/bifurcated-portfolio-utils';

export const GET = AshwinApi.GET;
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: exits 0. The route should appear in the build output under `app/api/ashwin-api` as a dynamic API route.

- [ ] **Step 3: Commit**

```bash
git add app/api/ashwin-api/route.ts
git commit -m "feat(ashwin): add /api/ashwin-api route"
```

---

## Task 3: Holdings API route

**Files:**
- Create: `app/api/ashwin-holdings-api/route.ts`

A copy of `app/api/arwani-holdings-api/route.ts` with two constant substitutions and string-literal updates. The file is ~183 lines and contains all the equity/MF holdings fetching + summary logic. All Prisma calls in it are read-only (`findFirst`, `findMany`, `count`).

- [ ] **Step 1: Read the Arwani holdings route as the source of truth**

Run: `Read app/api/arwani-holdings-api/route.ts` (full file). Take note of:
- The two constants near the top: `ARWANI_ICODE = "QUS00085"` and `ARWANI_QCODE = "QAC00071"`.
- Where they're referenced (auth check, DB query filters).
- Any error message strings containing the word "Arwani".

- [ ] **Step 2: Write the new route file**

Use `Write`. Take the full Arwani file contents and apply these substitutions:

| Find | Replace |
|---|---|
| `ARWANI_ICODE = "QUS00085"` | `ASHWIN_ICODE = "QUS00097"` |
| `ARWANI_QCODE = "QAC00071"` | `ASHWIN_QCODE = "QAC00083"` |
| All `ARWANI_ICODE` identifier references | `ASHWIN_ICODE` |
| All `ARWANI_QCODE` identifier references | `ASHWIN_QCODE` |
| `"Arwani"` in any user-facing string | `"Ashwin"` |
| `Arwani` in any code comment | `Ashwin` |

Do **not** alter any Prisma operation — every `findFirst`, `findMany`, `count` stays exactly as in Arwani's route.

- [ ] **Step 3: Verify it is read-only**

Run: `grep -E "create|update|delete|upsert|\\\$executeRaw" app/api/ashwin-holdings-api/route.ts`
Expected: no matches. If anything is returned, remove it — this route must be SELECT-only per `CLAUDE.md`'s database safety rules.

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/ashwin-holdings-api/route.ts
git commit -m "feat(ashwin): add /api/ashwin-holdings-api route (copy of arwani)"
```

---

## Task 4: Dashboard wiring

**Files:**
- Modify: `app/dashboard/page.tsx` (5 small edits)

Five surgical ternary extensions to recognize Ashwin (`QUS00097`) as a bifurcated client and route him through the new API.

- [ ] **Step 1: Add `isAshwin` detection + include in `isBifurcatedClient`**

Use `Edit`. `old_string`:

```ts
  const isArwani = effectiveIcode === "QUS00085";
  const isBifurcatedClient = isDinesh || isShilpa || isVikram || isArwani;
```

`new_string`:

```ts
  const isArwani = effectiveIcode === "QUS00085";
  const isAshwin = effectiveIcode === "QUS00097";
  const isBifurcatedClient = isDinesh || isShilpa || isVikram || isArwani || isAshwin;
```

- [ ] **Step 2: Extend the `bifurcatedConfig` ternary**

Use `Edit`. `old_string`:

```ts
        const bifurcatedConfig = isDinesh
          ? { api: "/api/dinesh-api", qcode: "QAC00053", name: "Dinesh" }
          : isShilpa
          ? { api: "/api/shilpa-api", qcode: "QAC00040", name: "Shilpa" }
          : isVikram
          ? { api: "/api/vikram-api", qcode: "QAC00043", name: "Vikram Trading" }
          : { api: "/api/arwani-api", qcode: "QAC00071", name: "Arwani" };
```

`new_string`:

```ts
        const bifurcatedConfig = isDinesh
          ? { api: "/api/dinesh-api", qcode: "QAC00053", name: "Dinesh" }
          : isShilpa
          ? { api: "/api/shilpa-api", qcode: "QAC00040", name: "Shilpa" }
          : isVikram
          ? { api: "/api/vikram-api", qcode: "QAC00043", name: "Vikram Trading" }
          : isArwani
          ? { api: "/api/arwani-api", qcode: "QAC00071", name: "Arwani" }
          : { api: "/api/ashwin-api", qcode: "QAC00083", name: "Ashwin Agarwal" };
```

- [ ] **Step 3: Extend `hasNavBasedTotalPortfolio`**

Use `Edit`. `old_string`:

```ts
    const hasNavBasedTotalPortfolio = isDinesh || isArwani;
```

`new_string`:

```ts
    const hasNavBasedTotalPortfolio = isDinesh || isArwani || isAshwin;
```

- [ ] **Step 4: Extend the broker label ternary on `<StatsCards>`**

Use `Edit`. `old_string`:

```ts
          broker={isDinesh ? "Dinesh" : isShilpa ? "Shilpa" : isVikram ? "Vikram Trading" : "Arwani"}
```

`new_string`:

```ts
          broker={isDinesh ? "Dinesh" : isShilpa ? "Shilpa" : isVikram ? "Vikram Trading" : isArwani ? "Arwani" : "Ashwin Agarwal"}
```

- [ ] **Step 5: Extend the empty-state error label ternary**

Use `Edit`. `old_string`:

```ts
        No strategy data found for {isSarla ? "Sarla" : isSatidham ? "Satidham" : isDinesh ? "Dinesh" : isShilpa ? "Shilpa" : isVikram ? "Vikram Trading" : "Arwani"} user.
```

`new_string`:

```ts
        No strategy data found for {isSarla ? "Sarla" : isSatidham ? "Satidham" : isDinesh ? "Dinesh" : isShilpa ? "Shilpa" : isVikram ? "Vikram Trading" : isArwani ? "Arwani" : "Ashwin Agarwal"} user.
```

- [ ] **Step 6: Run the build**

Run: `npm run build`
Expected: exits 0. If TypeScript complains about `isAshwin` being unused inside a particular scope, that means a ternary still needs extending — re-scan Steps 2–5.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(ashwin): wire dashboard detection and routing for Ashwin"
```

---

## Task 5: Holding-summary wiring

**Files:**
- Modify: `app/holding-summary/page.tsx` (4 small edits)

Adds `isAshwin` detection, an `fetchAshwinHoldings` function, dispatches to it, and updates the dependency lists.

- [ ] **Step 1: Add `isAshwin` detection**

Use `Edit`. `old_string`:

```ts
    const isArwani = session?.user?.icode === "QUS00085";
    const isDinesh = session?.user?.icode === "QUS00072";
```

`new_string`:

```ts
    const isArwani = session?.user?.icode === "QUS00085";
    const isAshwin = session?.user?.icode === "QUS00097";
    const isDinesh = session?.user?.icode === "QUS00072";
```

- [ ] **Step 2: Extend the dispatch chain in the auth `useEffect`**

Use `Edit`. `old_string`:

```ts
        if (isArwani) {
            fetchArwaniHoldings();
        } else if (isDinesh) {
            fetchDineshHoldings();
        } else if (isSarla || isSatidham) {
            fetchHoldingsForSpecialAccounts();
        } else {
            fetchAccounts();
        }
    }, [status, router, isSarla, isSatidham, isArwani, isDinesh, accountCode]);
```

`new_string`:

```ts
        if (isArwani) {
            fetchArwaniHoldings();
        } else if (isAshwin) {
            fetchAshwinHoldings();
        } else if (isDinesh) {
            fetchDineshHoldings();
        } else if (isSarla || isSatidham) {
            fetchHoldingsForSpecialAccounts();
        } else {
            fetchAccounts();
        }
    }, [status, router, isSarla, isSatidham, isArwani, isAshwin, isDinesh, accountCode]);
```

- [ ] **Step 3: Update the second `useEffect` guard + deps**

Use `Edit`. `old_string`:

```ts
    useEffect(() => {
        if (selectedAccount && !isSarla && !isSatidham && !isArwani && !isDinesh) {
            fetchHoldingsData();
        }
    }, [selectedAccount, isSarla, isSatidham, isArwani, isDinesh]);
```

`new_string`:

```ts
    useEffect(() => {
        if (selectedAccount && !isSarla && !isSatidham && !isArwani && !isAshwin && !isDinesh) {
            fetchHoldingsData();
        }
    }, [selectedAccount, isSarla, isSatidham, isArwani, isAshwin, isDinesh]);
```

- [ ] **Step 4: Add `fetchAshwinHoldings` after `fetchArwaniHoldings`**

Use `Edit`. `old_string` is the end of `fetchArwaniHoldings` and the start of `fetchDineshHoldings`:

```ts
    const fetchArwaniHoldings = async () => {
        try {
            const res = await fetch(`/api/arwani-holdings-api`, { credentials: "include" });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to load Arwani holdings");
            }
            const data: {
                holdingsSummary: HoldingsSummary;
                availableStrategies: string[];
                dataAsOfDate: string | null;
            } = await res.json();

            setHoldingsData(data.holdingsSummary);
            setAvailableStrategies(data.availableStrategies || []);
            if (data.dataAsOfDate) {
                const d = new Date(data.dataAsOfDate);
                if (!isNaN(d.getTime())) setLastUpdatedDate(d);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load holdings data");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchDineshHoldings = async () => {
```

`new_string`:

```ts
    const fetchArwaniHoldings = async () => {
        try {
            const res = await fetch(`/api/arwani-holdings-api`, { credentials: "include" });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to load Arwani holdings");
            }
            const data: {
                holdingsSummary: HoldingsSummary;
                availableStrategies: string[];
                dataAsOfDate: string | null;
            } = await res.json();

            setHoldingsData(data.holdingsSummary);
            setAvailableStrategies(data.availableStrategies || []);
            if (data.dataAsOfDate) {
                const d = new Date(data.dataAsOfDate);
                if (!isNaN(d.getTime())) setLastUpdatedDate(d);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load holdings data");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchAshwinHoldings = async () => {
        try {
            const res = await fetch(`/api/ashwin-holdings-api`, { credentials: "include" });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to load Ashwin holdings");
            }
            const data: {
                holdingsSummary: HoldingsSummary;
                availableStrategies: string[];
                dataAsOfDate: string | null;
            } = await res.json();

            setHoldingsData(data.holdingsSummary);
            setAvailableStrategies(data.availableStrategies || []);
            if (data.dataAsOfDate) {
                const d = new Date(data.dataAsOfDate);
                if (!isNaN(d.getTime())) setLastUpdatedDate(d);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load holdings data");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchDineshHoldings = async () => {
```

- [ ] **Step 5: Run the build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add app/holding-summary/page.tsx
git commit -m "feat(ashwin): wire holding-summary detection and fetcher for Ashwin"
```

---

## Task 6: Verification

**Files:** none modified — gates only.

Final gates and a manual checklist for the operator to run before declaring complete.

- [ ] **Step 1: Full build + lint**

Run: `npm run build && npm run lint`
Expected: both exit 0. Any TypeScript or ESLint error must be fixed before proceeding (re-run from the failing task, not by silencing).

- [ ] **Step 2: Read-only audit on every file added/changed**

Run:
```bash
git diff main...HEAD --name-only -- 'app/**/*.ts' 'app/**/*.tsx' | xargs grep -nE "prisma\.[a-zA-Z_]+\.(create|update|delete|upsert)|\\\$executeRaw" || echo "OK — no write operations found"
```
Expected: prints `OK — no write operations found`. If any match appears, that file violates `CLAUDE.md`'s read-only rule — fix before merging.

- [ ] **Step 3: Smoke test the portfolio API**

Start dev server (`npm run dev`), then in a browser logged in as Ashwin (`QUS00097`) or via curl with session cookies:
- GET `http://localhost:2030/api/ashwin-api?qcode=QAC00083`
- Confirm the response is a JSON object whose top-level keys are exactly `Total Portfolio`, `Scheme QYE++`, `Scheme QAW++`.
- Confirm each key has `.data.amountDeposited`, `.data.currentExposure`, `.data.return`, `.data.equityCurve`, `.metadata.isActive`.

- [ ] **Step 4: Cross-check cash flows against the DB**

Spec values to confirm (from the DB investigation):
- `Scheme QAW++` `amountDeposited` ≈ ₹1,25,00,000 (10,000,000 on 2026-05-04 + 2,500,000 on 2026-05-14).
- `Scheme QYE++` `amountDeposited` should match `SUM(capital_in_out)` over `bifurcated_master_sheet_test` rows where `qcode = 'QAC00083' AND system_tag = 'QYE++ Zerodha Total Portfolio'`. Verify in Prisma Studio.
- `Total Portfolio` final NAV ≈ 113.06 with `equityCurve.length = 54`.

- [ ] **Step 5: Smoke test the holdings API**

GET `http://localhost:2030/api/ashwin-holdings-api` while logged in as Ashwin. Expect:
- `holdingsSummary.holdingsCount = 26` (6 equity + 20 MF).
- `availableStrategies` contains `"QAW++"` and `"QYE++"`.
- `dataAsOfDate` ≈ `2026-05-18`.

- [ ] **Step 6: Render check**

In the browser:
- Log in as `QUS00097` → land on `/dashboard`. Confirm the strategy dropdown lists three entries and each renders stats + chart without console errors.
- Navigate to `/holding-summary`. Confirm 6 equity + 20 MF holdings are displayed and the strategy filter chip offers `QAW++` and `QYE++`.

- [ ] **Step 7: Regression sweep**

Log in (or impersonate via the internal-access flow) as each of: `QUS00085` (Arwani), `QUS00072` (Dinesh), `QUS00067` (Shilpa), `QUS00068` (Vikram). For each, confirm `/dashboard` and `/holding-summary` still load and the strategy dropdown still shows their expected entries. If any has changed, revert to the previous task and re-check the ternary edits — Ashwin's addition must not have shifted another client's branch.

- [ ] **Step 8: Final summary commit (only if anything was fixed in Steps 1–7)**

If a fix was needed during verification, commit it with a clear message:

```bash
git add <fixed files>
git commit -m "fix(ashwin): <what was wrong>"
```

Otherwise nothing to commit at this step.

---

## File Structure Summary

| Path | Action | Purpose |
|---|---|---|
| `app/lib/bifurcated-portfolio-utils.ts` | Modify | Add `ASHWIN_CONFIG`, `ashwinEngine`, `AshwinApi` |
| `app/api/ashwin-api/route.ts` | Create | Re-export `AshwinApi.GET` |
| `app/api/ashwin-holdings-api/route.ts` | Create | Copy of `arwani-holdings-api` with `ASHWIN_ICODE`/`ASHWIN_QCODE` constants |
| `app/dashboard/page.tsx` | Modify | 5 ternary extensions to recognize `isAshwin` |
| `app/holding-summary/page.tsx` | Modify | Add `isAshwin` + `fetchAshwinHoldings` + extend dispatch and dep lists |

No deletions. No deps added. No schema changes.
