# Generalize Bifurcated Holdings Summary to Regular Managed Accounts

**Date:** 2026-05-29
**Status:** Approved design, ready for implementation plan
**Scope:** Regular managed accounts (Zerodha / Jainam / Radiance). Not PMS, not Sarla/Satidham.

## Goal

Give regular managed accounts a working holdings view on `/holding-summary`, in the **same server-aggregated format** the bifurcated clients already get, by routing them through the existing `/api/bifurcated-holdings` endpoint. Their holdings data is migrated (by the data team) into `bifurcated_equity_holding_test` / `bifurcated_mutual_fund_holding_sheet_test`, keyed by qcode — the same way portfolio data was migrated into `bifurcated_master_sheet_test`.

## Background: current state

- **The only holdings API is `/api/bifurcated-holdings`.** It auths via `authorizeBifurcatedRequest` (registry `findByQcode`), reads the latest-date rows from `bifurcated_equity_holding_test` + `bifurcated_mutual_fund_holding_sheet_test` by qcode, aggregates server-side into `HoldingsSummary`, and returns `{ holdingsSummary, availableStrategies, dataAsOfDate }`.
- **Regular managed accounts have no working holdings today.** `app/holding-summary/page.tsx`'s `fetchHoldingsData` calls `/api/portfolio` (managed) or `/api/pms-data` (PMS) and reads `response.data?.holdings` / `response.holdings` — **neither endpoint emits a `holdings` key**, so `holdingsData` stays null and the view is empty.
- **Legacy holdings tables** (`equity_holding`, `mutual_fund_holding_sheet`) have **no `strategy` column**; `DataFetchingStrategy.getHoldings` returns raw rows with no `strategy` field and is not called by the holdings page.
- **Sarla/Satidham** fetch holdings via `/api/sarla-api` (`fetchHoldingsForSpecialAccounts`) — works, out of scope.
- **Rendering is already shared**: `HoldingsTable` + `AssetAllocationChart` (inline components in the page) serve all branches; the strategy dropdown/column is gated on `availableStrategies.length > 0`.

## Chosen approach

**Migration-backed unification.** The data team populates the bifurcated holdings tables for regular managed accounts (keyed by qcode). The code reuses `/api/bifurcated-holdings` + the existing rendering. The only code changes are (1) generalize holdings authorization from the registry to `pooled_account_users` ownership, and (2) repoint the page's managed-account fetch to the holdings endpoint with the selected qcode.

Rejected alternatives (from brainstorming):
- *Server-aggregation over the legacy tables*: avoids migration but forks the data path and leaves regular accounts without strategy support; the team prefers one unified table set + endpoint, mirroring the portfolio migration.
- *Hybrid route-by-registry*: unnecessary once everyone's data is in the bifurcated tables.

## Component design

### 1. Authorization — new `authorizeHoldingsRequest` (`app/lib/bifurcated-auth.ts`)

Add a sibling to `authorizeBifurcatedRequest` that authorizes by **account ownership**, not the registry:

```
authorizeHoldingsRequest(req):
  session = getServerSession(authOptions)            -> 401 if absent
  effectiveIcode = getEffectiveIcode(session)        -> 401 if absent (impersonation-aware)
  qcode = url.searchParams.get("qcode")              -> 400 if absent
  owns = await prisma.pooled_account_users.findFirst({ where: { icode: effectiveIcode, qcode } })
  if (!owns) return 403
  return { ok: true, qcode }
```

- Works for **all** clients uniformly — registry-bifurcated clients also have `pooled_account_users` rows, so they keep working.
- The holdings query only needs the qcode, not any registry config.
- READ-ONLY: one added `findFirst` on `pooled_account_users`.
- **Separate function (not a modification of `authorizeBifurcatedRequest`)** so `/api/bifurcated-portfolio`'s auth is untouched (blast-radius safety). `authorizeBifurcatedRequest` stays registry-based for the portfolio route.

### 2. Endpoint — `/api/bifurcated-holdings/route.ts`

Swap its auth call from `authorizeBifurcatedRequest` to `authorizeHoldingsRequest`, and read the qcode from that result. Everything else (the two `findFirst` latest-date lookups, the `findMany` row fetches, `processHoldingsSummary`, `availableStrategies`, response shape) is **unchanged** — it already works by qcode against the bifurcated holdings tables, so it serves regular accounts as soon as their data is migrated.

Keep the endpoint name `/api/bifurcated-holdings` (renaming would churn the working registry-client path + the shared auth helper for no functional gain).

### 3. Frontend — `app/holding-summary/page.tsx`

Repoint `fetchHoldingsData`'s **managed branch only**:

```
fetchHoldingsData(selectedAccount):
  acct = accounts.find(qcode === selectedAccount)
  if acct.account_type === "pms":
      leave exactly as today        // out of scope; stays empty as it is now
  else (managed):
      res = await fetch(`/api/bifurcated-holdings?qcode=${acct.qcode}`, { credentials: "include" })
      data = await res.json()
      setHoldingsData(data.holdingsSummary)
      setAvailableStrategies(data.availableStrategies || [])
      if (data.dataAsOfDate) setLastUpdatedDate(new Date(data.dataAsOfDate))
```

This makes the managed branch behave exactly like `fetchBifurcatedHoldings` — same response shape, same state setters — driven by the selected account's qcode. The two functions may be collapsed into one shared `fetchHoldingsByQcode(qcode)` (cleanup; optional).

Inherited for free:
- **Multi-account regular clients**: account selector preserved; switching accounts refetches holdings for that qcode.
- **Strategy dropdown/column**: already conditional on `availableStrategies.length > 0`. Regular managed holdings with null/single strategy → no dropdown, clean single-strategy view. Multi-strategy → breakdown appears automatically.
- **Rendering**: `HoldingsTable` + `AssetAllocationChart` branches unchanged.

PMS branch and Sarla/Satidham branch are not touched.

### 4. Migration-coverage script (read-only) — `scripts/check-bifurcated-holdings-coverage.ts`

A small `tsx` script that lists regular managed accounts and whether each has rows in `bifurcated_equity_holding_test` / `bifurcated_mutual_fund_holding_sheet_test`, so the team can track migration progress. Only `findMany` / `count`. (Optional but recommended — mirrors the validator/investigation tooling from the portfolio work.)

## Data prerequisite (gating)

The data team must migrate each regular managed account's holdings into the bifurcated holdings tables, keyed by qcode, at the latest date. **Incremental and safe**: until an account's holdings land, its view stays empty — identical to today's broken state, so no regression. Accounts light up as data is populated. The coverage script tracks this.

## Risks

1. **Auth blast radius** — `authorizeBifurcatedRequest` is shared with `/api/bifurcated-portfolio`. Mitigated by adding a **separate** `authorizeHoldingsRequest` and only swapping the holdings route to it; portfolio auth is untouched.
2. **PMS stays empty** — out of scope; PMS holdings remain as-is (already empty). No regression.
3. **Strategy column surprise** — if migrated managed rows carry a `strategy` value, the dropdown/column appears automatically. Flag for the data team to decide whether managed rows get a strategy tag or null.
4. **Pre-existing `debtHoldings` overlap** — `processHoldingsSummary` puts debt-flagged rows in *both* `equityHoldings` (by `type === "equity"`) and `debtHoldings` (by `debtEquity === "debt"`). Already affects bifurcated clients; generalizing extends it to regular ones. Not introduced here — optional follow-up fix, out of scope.

## Verification

- No "old working view" to parity-check (regular holdings are currently empty on this page). Reference is the legacy `equity_holding` / `mutual_fund_holding_sheet` tables: for a sample migrated managed account, confirm rendered symbols / quantities / values / totals match the legacy data.
- `npm run build` exits 0.
- Read-only audit: no new write operations across changed files (only an added `pooled_account_users` read).
- Regression: bifurcated registry clients + Sarla/Satidham still render holdings unchanged.
- Coverage script reports the migrated sample account as covered.

## Out of scope (explicit)

- PMS accounts (custodian-code holdings; separate migration + data shape).
- Sarla/Satidham (own path, untouched).
- Existing bifurcated registry clients (unchanged behavior — they already work).
- The `debtHoldings` double-count fix (optional follow-up).
- Endpoint rename.
- Holdings on the main dashboard (this is the `/holding-summary` page only).

## Future work

- Extend to PMS once the data team decides how custodian holdings map into the bifurcated tables.
- Optionally collapse `fetchBifurcatedHoldings` + the managed branch of `fetchHoldingsData` into one shared fetcher.
- Fix the `debtHoldings` overlap in `processHoldingsSummary`.
