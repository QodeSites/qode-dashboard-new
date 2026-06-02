# Generalize Holdings Summary to Regular Managed Accounts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve regular managed accounts (Zerodha/Jainam/Radiance) their holdings on `/holding-summary` via the existing `/api/bifurcated-holdings` endpoint, reading the bifurcated holdings tables by qcode, with ownership authorized through `pooled_account_users`.

**Architecture:** Add a `pooled_account_users`-based `authorizeHoldingsRequest` (separate from the registry-based `authorizeBifurcatedRequest` so `/api/bifurcated-portfolio` auth is untouched); swap the holdings route to it; repoint the holding-summary page's managed-account fetch branch to call `/api/bifurcated-holdings?qcode=<selected>`. PMS, Sarla/Satidham, and registry-bifurcated clients are unchanged.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Prisma (PostgreSQL), NextAuth.js.

**Spec:** `docs/superpowers/specs/2026-05-29-generalize-holdings-summary-design.md`

**Database safety:** All changes are READ-ONLY. The only new DB access is one `findFirst` on `pooled_account_users`. No `create`/`update`/`delete`/`upsert`/`$executeRaw`.

**Data prerequisite (gating, external):** The data team must populate `bifurcated_equity_holding_test` / `bifurcated_mutual_fund_holding_sheet_test` for each managed account, keyed by qcode. Until an account's rows land, its holdings view stays empty — identical to today's (broken) state, so no regression. The Task 4 coverage script tracks this.

**Testing note:** No automated test suite for this path. Each code task gates on `npm run build` exit 0 + a read-only grep. Behavior is verified manually (Task 5) since there is no pre-existing working regular-holdings view to diff against.

---

## Task 1: Add `authorizeHoldingsRequest` (pooled_account_users ownership)

**Files:**
- Modify: `app/lib/bifurcated-auth.ts`

Adds a sibling to `authorizeBifurcatedRequest` that authorizes by account ownership instead of the registry. The existing `authorizeBifurcatedRequest` is left untouched (it stays the auth for `/api/bifurcated-portfolio`).

- [ ] **Step 1: Add the prisma import**

The file currently imports `getServerSession`, `authOptions`, `getEffectiveIcode`, and registry helpers — but not prisma. Use `Edit`. `old_string`:
```ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getEffectiveIcode } from "./admin-utils";
import {
  findByQcode,
  type BifurcatedClientEntry,
} from "./bifurcated-clients-registry";
```

`new_string`:
```ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getEffectiveIcode } from "./admin-utils";
import { prisma } from "@/lib/prisma";
import {
  findByQcode,
  type BifurcatedClientEntry,
} from "./bifurcated-clients-registry";
```

- [ ] **Step 2: Append the new result type + `authorizeHoldingsRequest` at the end of the file**

Use `Edit`. `old_string` (the closing of `authorizeBifurcatedRequest`):
```ts
  if (client.icode !== effectiveIcode) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, client };
}
```

`new_string`:
```ts
  if (client.icode !== effectiveIcode) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, client };
}

export type HoldingsAuthResult =
  | { ok: true; qcode: string }
  | { ok: false; response: NextResponse };

// Authorizes a holdings request by ACCOUNT OWNERSHIP rather than the
// bifurcated registry, so it works for ALL managed clients (registry clients
// also have pooled_account_users rows). Reads the session's effective icode
// (impersonation-aware) and ?qcode=, then verifies the icode has an access
// row for that qcode in pooled_account_users. The holdings query only needs
// the qcode, so no registry config is returned. READ-ONLY.
export async function authorizeHoldingsRequest(
  req: Request
): Promise<HoldingsAuthResult> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const effectiveIcode = getEffectiveIcode(session);
  if (!effectiveIcode) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const url = new URL(req.url);
  const qcode = url.searchParams.get("qcode");
  if (!qcode) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Missing qcode" }, { status: 400 }),
    };
  }
  const access = await prisma.pooled_account_users.findFirst({
    where: { icode: effectiveIcode, qcode },
    select: { id: true },
  });
  if (!access) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, qcode };
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0. The new function is unused at this point — fine.

- [ ] **Step 4: Read-only audit**

Run:
```bash
grep -nE "prisma\.[a-zA-Z_]+\.(create|createMany|update|updateMany|delete|deleteMany|upsert)|\$executeRaw" app/lib/bifurcated-auth.ts || echo "OK — read-only"
```
Expected: `OK — read-only` (the only prisma call is `pooled_account_users.findFirst`).

- [ ] **Step 5: Commit**

```bash
git add app/lib/bifurcated-auth.ts
git commit -m "feat(holdings): add pooled_account_users-based authorizeHoldingsRequest"
```

---

## Task 2: Swap the holdings route to `authorizeHoldingsRequest`

**Files:**
- Modify: `app/api/bifurcated-holdings/route.ts`

The route's query logic already works by qcode against the bifurcated holdings tables. Only its auth call changes — from registry-based to ownership-based — so it serves any owned qcode.

- [ ] **Step 1: Update the import**

Read the top of `app/api/bifurcated-holdings/route.ts` to find its import of `authorizeBifurcatedRequest`. Use `Edit` to switch it to `authorizeHoldingsRequest`. `old_string`:
```ts
import { authorizeBifurcatedRequest } from "@/app/lib/bifurcated-auth";
```
`new_string`:
```ts
import { authorizeHoldingsRequest } from "@/app/lib/bifurcated-auth";
```

(If the import is grouped with other names from the same module, adapt: keep the other names, swap `authorizeBifurcatedRequest` → `authorizeHoldingsRequest`.)

- [ ] **Step 2: Update the GET handler's auth call + qcode source**

Use `Edit`. `old_string`:
```ts
    const auth = await authorizeBifurcatedRequest(req);
    if (!auth.ok) return auth.response;
    const qcode = auth.client.qcode;
```

`new_string`:
```ts
    const auth = await authorizeHoldingsRequest(req);
    if (!auth.ok) return auth.response;
    const qcode = auth.qcode;
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0. If TypeScript flags any other reference to `auth.client` in this file, there isn't one expected — but if found, it means the route used more of the registry entry than just the qcode; STOP and report (the spec assumed only the qcode is used).

- [ ] **Step 4: Read-only audit**

Run:
```bash
grep -nE "prisma\.[a-zA-Z_]+\.(create|createMany|update|updateMany|delete|deleteMany|upsert)|\$executeRaw" app/api/bifurcated-holdings/route.ts || echo "OK — read-only"
```
Expected: `OK — read-only` (only `findFirst`/`findMany` on the bifurcated holdings tables).

- [ ] **Step 5: Commit**

```bash
git add app/api/bifurcated-holdings/route.ts
git commit -m "feat(holdings): authorize /api/bifurcated-holdings by account ownership"
```

---

## Task 3: Repoint the holding-summary managed fetch branch

**Files:**
- Modify: `app/holding-summary/page.tsx`

`fetchHoldingsData` (regular-account path) currently calls `/api/portfolio`/`/api/pms-data` and reads a `.holdings` key that those endpoints never emit. Repoint the **managed** branch to `/api/bifurcated-holdings?qcode=<selected>`; leave the **PMS** branch exactly as today (out of scope).

- [ ] **Step 1: Read the current function**

Read `app/holding-summary/page.tsx` lines 644–700 to confirm the exact current body of `fetchHoldingsData` (it ends just before `const getAssetAllocation = () => {`).

- [ ] **Step 2: Replace the function body**

Use `Edit`. `old_string` (the full current function):
```ts
    const fetchHoldingsData = async () => {
        if (!selectedAccount) return;

        setIsLoading(true);
        try {
            const selectedAccountData = accounts.find((acc) => acc.qcode === selectedAccount);
            if (!selectedAccountData) {
                throw new Error("Selected account not found");
            }

            const endpoint = selectedAccountData.account_type === "pms"
                ? `/api/pms-data?qcode=${selectedAccount}&viewMode=consolidated&accountCode=${accountCode}`
                : `/api/portfolio?viewMode=consolidated&qcode=${selectedAccount}&accountCode=${accountCode}`;

            const res = await fetch(endpoint, { credentials: "include" });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to load holdings data");
            }

            const response = await res.json();

            let holdings = null;
            if (response.data?.holdings) {
                holdings = response.data.holdings;
            } else if (response.holdings) {
                holdings = response.holdings;
            }

            if (holdings) {
                setHoldingsData(holdings);

                const allHoldings = [
                    ...(holdings.equityHoldings || []),
                    ...(holdings.debtHoldings || []),
                    ...(holdings.mutualFundHoldings || [])
                ];

                if (allHoldings.length > 0) {
                    const validDates = allHoldings
                        .map((h: Holding) => h.date)
                        .filter((date: Date | null) => date != null)
                        .map((date: Date | string) => new Date(date))
                        .filter((date: Date) => !isNaN(date.getTime()));

                    if (validDates.length > 0) {
                        const lastUpdated = new Date(Math.max(...validDates.map((d: Date) => d.getTime())));
                        setLastUpdatedDate(lastUpdated);
                    }
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load holdings data");
        } finally {
            setIsLoading(false);
        }
    };
```

`new_string`:
```ts
    const fetchHoldingsData = async () => {
        if (!selectedAccount) return;

        setIsLoading(true);
        try {
            const selectedAccountData = accounts.find((acc) => acc.qcode === selectedAccount);
            if (!selectedAccountData) {
                throw new Error("Selected account not found");
            }

            // PMS accounts are out of scope for the bifurcated-holdings
            // migration — keep the legacy behavior (reads a .holdings key that
            // /api/pms-data does not currently emit; stays empty as before).
            if (selectedAccountData.account_type === "pms") {
                const res = await fetch(
                    `/api/pms-data?qcode=${selectedAccount}&viewMode=consolidated&accountCode=${accountCode}`,
                    { credentials: "include" }
                );
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || "Failed to load holdings data");
                }
                const response = await res.json();
                const holdings = response.data?.holdings ?? response.holdings ?? null;
                if (holdings) {
                    setHoldingsData(holdings);
                    const allHoldings = [
                        ...(holdings.equityHoldings || []),
                        ...(holdings.debtHoldings || []),
                        ...(holdings.mutualFundHoldings || [])
                    ];
                    const validDates = allHoldings
                        .map((h: Holding) => h.date)
                        .filter((date: Date | null) => date != null)
                        .map((date: Date | string) => new Date(date))
                        .filter((date: Date) => !isNaN(date.getTime()));
                    if (validDates.length > 0) {
                        setLastUpdatedDate(new Date(Math.max(...validDates.map((d: Date) => d.getTime()))));
                    }
                }
                return;
            }

            // Managed accounts (Zerodha/Jainam/Radiance): served from the
            // bifurcated holdings tables via the shared holdings endpoint,
            // keyed by the selected account's qcode. Same response shape +
            // state setters as fetchBifurcatedHoldings.
            const res = await fetch(
                `/api/bifurcated-holdings?qcode=${selectedAccount}`,
                { credentials: "include" }
            );
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to load holdings data");
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
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0. `HoldingsSummary` and the `setAvailableStrategies` / `setHoldingsData` / `setLastUpdatedDate` setters are already declared in this file (used by `fetchBifurcatedHoldings`) — confirm via a quick grep if the build complains:
```bash
grep -nE "interface HoldingsSummary|setAvailableStrategies|setLastUpdatedDate" app/holding-summary/page.tsx | head
```

- [ ] **Step 4: Read-only audit (frontend file, expect zero prisma)**

Run:
```bash
grep -nE "prisma\." app/holding-summary/page.tsx || echo "OK — no prisma in frontend"
```
Expected: `OK — no prisma in frontend`.

- [ ] **Step 5: Commit**

```bash
git add app/holding-summary/page.tsx
git commit -m "feat(holdings): route managed accounts to /api/bifurcated-holdings"
```

---

## Task 4: Migration-coverage script (read-only)

**Files:**
- Create: `scripts/check-bifurcated-holdings-coverage.ts`

Lists managed accounts and whether each has rows in the bifurcated holdings tables, so the data team can track migration progress.

- [ ] **Step 1: Create the script**

Use `Write` for `scripts/check-bifurcated-holdings-coverage.ts`:
```ts
/**
 * Coverage report: which managed accounts have holdings migrated into the
 * bifurcated holdings tables (bifurcated_equity_holding_test /
 * bifurcated_mutual_fund_holding_sheet_test).
 *
 * Until an account appears as COVERED here, its /holding-summary view will be
 * empty (no regression — it was empty before too). Use this to track the
 * data-team migration of regular managed accounts.
 *
 * THIS SCRIPT IS READ-ONLY — only findMany / count.
 *
 * Usage: npx tsx scripts/check-bifurcated-holdings-coverage.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=".repeat(80));
  console.log("BIFURCATED HOLDINGS COVERAGE — managed accounts");
  console.log("=".repeat(80));

  const accounts = await prisma.accounts.findMany({
    where: { account_type: "managed_account" },
    select: { qcode: true, account_name: true, broker: true },
    orderBy: { qcode: "asc" },
  });

  let covered = 0;
  for (const a of accounts) {
    const eq = await prisma.bifurcated_equity_holding_test.count({
      where: { qcode: a.qcode },
    });
    const mf = await prisma.bifurcated_mutual_fund_holding_sheet_test.count({
      where: { qcode: a.qcode },
    });
    const ok = eq > 0 || mf > 0;
    if (ok) covered++;
    console.log(
      `  ${ok ? "✓" : "·"} ${a.qcode.padEnd(10)} ${(a.account_name || "").padEnd(28)} ${(a.broker || "").padEnd(10)} eq=${String(eq).padStart(4)} mf=${String(mf).padStart(4)}`
    );
  }

  console.log("\n" + "=".repeat(80));
  console.log(`${covered}/${accounts.length} managed accounts have bifurcated holdings rows`);
  console.log("=".repeat(80));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
```

- [ ] **Step 2: Read-only audit**

Run:
```bash
grep -nE "prisma\.[a-zA-Z_]+\.(create|createMany|update|updateMany|delete|deleteMany|upsert)|\$executeRaw" scripts/check-bifurcated-holdings-coverage.ts || echo "OK — read-only"
```
Expected: `OK — read-only`.

- [ ] **Step 3: Run it**

Run: `npx tsx scripts/check-bifurcated-holdings-coverage.ts`
Expected: a table of managed accounts with `✓`/`·` coverage flags and a summary count. (If the DB is briefly unreachable — connection refused at 139.5.190.184 — retry once or twice; if it stays down, note it and still commit, since the logic is verifiable by reading the code.)

- [ ] **Step 4: Commit**

```bash
git add scripts/check-bifurcated-holdings-coverage.ts
git commit -m "feat(holdings): add bifurcated holdings coverage script for managed accounts"
```

---

## Task 5: Verification

**Files:** none modified — gates only.

- [ ] **Step 1: Build + read-only audit on the whole change**

Run:
```bash
npm run build
git diff main...HEAD --name-only -- 'app/**/*.ts' 'app/**/*.tsx' 'scripts/**/*.ts' | xargs grep -nE "prisma\.[a-zA-Z_]+\.(create|createMany|update|updateMany|delete|deleteMany|upsert)|\$executeRaw" 2>/dev/null || echo "OK — no write operations found"
```
Expected: build exit 0; audit prints `OK — no write operations found`.

- [ ] **Step 2: API smoke test (manual, requires login)**

Start `npm run dev`. Logged in as a managed account's user (one with bifurcated holdings rows — use the Task 4 coverage script to pick a `✓` account), call:
- GET `http://localhost:2030/api/bifurcated-holdings?qcode=<that-qcode>` → 200 with `{ holdingsSummary, availableStrategies, dataAsOfDate }`.
- GET the same with a qcode the logged-in user does NOT own → expect 403.
- GET with no qcode → 400.

- [ ] **Step 3: Render check (manual)**

Log into `/holding-summary` as a managed account user with covered holdings:
- Confirm holdings now render (stock + MF tables, asset allocation, summary cards) — previously empty.
- If the account has multiple accounts, switch accounts in the selector and confirm holdings refetch for the newly selected qcode.
- Confirm the strategy dropdown/column appears only if the migrated rows carry strategy values (else a clean no-strategy view).

- [ ] **Step 4: Parity check vs legacy tables (manual)**

For one covered managed account, compare the rendered holdings (symbols, quantities, current values, total P&L) against the legacy `equity_holding` / `mutual_fund_holding_sheet` rows for that qcode at the latest date. Confirm they match (the migration should be faithful). Differences are a data-migration question for the data team, not a code bug.

- [ ] **Step 5: Regression check (manual)**

- Log in as a bifurcated registry client (e.g. Arwani `QUS00085`) → `/holding-summary` still renders its holdings + strategy breakdown unchanged.
- Log in as Sarla/Satidham → holdings still render via their own path.
- Log in as a managed account with NO migrated holdings yet → empty holdings view (no crash; same as before).

- [ ] **Step 6: Final commit (only if fixes were needed in Steps 1–5)**

```bash
git add <fixed files>
git commit -m "fix(holdings): <what was fixed>"
```

---

## File Structure Summary

| Path | Action | Purpose |
|---|---|---|
| `app/lib/bifurcated-auth.ts` | Modify | Add `authorizeHoldingsRequest` + `HoldingsAuthResult` (pooled_account_users ownership); `authorizeBifurcatedRequest` untouched |
| `app/api/bifurcated-holdings/route.ts` | Modify | Swap auth call to `authorizeHoldingsRequest`; read `auth.qcode` |
| `app/holding-summary/page.tsx` | Modify | Repoint `fetchHoldingsData` managed branch to `/api/bifurcated-holdings`; PMS branch unchanged |
| `scripts/check-bifurcated-holdings-coverage.ts` | Create | Read-only migration-coverage report for managed accounts |

No engine changes, no schema changes, no DB writes. PMS / Sarla-Satidham / registry-bifurcated clients and `/api/bifurcated-portfolio` auth are all untouched.
