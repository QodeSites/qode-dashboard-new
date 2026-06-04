# Single-Strategy Clients Sourced from `bifurcated_master_sheet_test`

**Date:** 2026-05-27
**Status:** Approved design, ready for implementation plan
**First client:** GRD (`icode QUS00106` / `qcode QAC00092`), a managed/Radiance single-strategy account.

## Goal

Let specific existing **single-strategy** managed accounts source their portfolio data from `bifurcated_master_sheet_test` (the same table the multi-scheme bifurcated clients use), while rendering in the **existing single-strategy dashboard format** — i.e. **no strategy dropdown**, no per-scheme badge, no "Total Portfolio" aggregate. The view must look identical to how single-strategy managed accounts render today.

This reuses the `BifurcatedPortfolioEngine`'s data-reading + metric computation (which already reads `bifurcated_master_sheet_test` correctly) AND the existing single-strategy render path (`app/dashboard/page.tsx` ~lines 1555-1602), gluing them with a `renderMode` discriminator on the registry.

## Background: the two existing flows

**Single-strategy (regular managed) — the target render format:**
- Detection: a user is "regular single-strategy" by failing all special checks (not Sarla, not Satidham, not in the bifurcated registry).
- API: `/api/portfolio?qcode=…` (managed/Zerodha/Jainam) via `DataFetchingStrategy` subclasses in `portfolio-utils.ts`, reading `master_sheet`. Returns a single `{ data: Stats, metadata }`.
- Render: `app/dashboard/page.tsx` ~1555-1602 — **no dropdown**, StatsCards → RevenueChart → PnlTable → CashFlows, driven by the `stats` state.

**Multi-scheme bifurcated — the data plumbing we reuse:**
- Registry (`bifurcated-clients-registry.ts`) → `/api/bifurcated-portfolio?qcode=…` → `BifurcatedPortfolioEngine.handleGET` → response **keyed by scheme** → dropdown render.
- The engine routes reads to `bifurcated_master_sheet_test` when `config.qodeTotalPortfolioTag` is set (the `msTable` getter).

## Confirmed data shape for GRD (`QAC00092`)

From the read-only investigation (`scripts/investigate-bifurcated-client.ts` + targeted probe):

| Tag | Rows | Range | End NAV |
|---|---|---|---|
| `QYE++ Total Portfolio Exposure` | 51 | 2026-03-11 → 2026-05-27 | 107.50 |
| `QYE++ Total Portfolio Value` | 51 | same | 107.21 |
| `Qode Total Portfolio` | 51 | same | 107.22 |
| `QYE++ Zerodha Total Portfolio` | 0 | — | — |
| `bifurcated_equity_holding_test` | 0 | — | — |
| `bifurcated_mutual_fund_holding_sheet_test` | 0 | — | — |

- `account_type: managed_account`, `broker: radiance`.
- Single strategy (QYE++). Radiance convention → `Total Portfolio Exposure` tag (not `Zerodha Total Portfolio`).
- Per the account owner's spec: both profit and exposure use `QYE++ Total Portfolio Exposure`.
- Inception 2026-03-11.
- No holdings in the bifurcated holdings tables (likely exposure/futures-style account).

## Approach (chosen)

**Reuse the bifurcated engine + reuse the existing single-strategy render path, glued by a `renderMode: "single"` discriminator on the registry.**

Rejected alternatives:
- *New `DataFetchingStrategy` subclass served via `/api/portfolio`*: would duplicate the table-read + metric logic (drawdown, trailing returns, PnL) that the bifurcated engine already implements — two engines reading the same table. Maintenance burden.
- *Render the single scheme through the bifurcated dropdown branch with the dropdown hidden*: renders through the bifurcated JSX (scheme badge, export-button labels, Total Portfolio toggle), so not pixel-identical to the current single-strategy view — fails the "render same format" requirement.

## Component design

### 1. `defineSingleStrategyClient` helper (`app/lib/bifurcated-client-builder.ts`)

A sibling to `defineBifurcatedClient`. Builds a `ClientConfig` with exactly one scheme and **no** "Total Portfolio" aggregate entry.

```ts
export interface DefineSingleStrategyClientInput {
  name: string;
  qcode: string;
  strategyName: string;     // the single scheme's display label, e.g. "QYE++"
  inceptionDate: string;    // YYYY-MM-DD
  exposure: string;         // system_tag for current value / deposit / metrics
  profit: string;           // system_tag for the NAV curve
  qodeTotalPortfolioTag?: string;  // default "Qode Total Portfolio" — table-routing only
  accountCode?: string;     // default "" (vestigial)
}

export function defineSingleStrategyClient(
  input: DefineSingleStrategyClientInput
): ClientConfig;
```

Produces:
```ts
{
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
  qodeTotalPortfolioTag: input.qodeTotalPortfolioTag ?? "Qode Total Portfolio",
  portfolioMapping: {
    // NOTE: NO "Total Portfolio" entry — exactly one scheme key.
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
  },
}
```

`qodeTotalPortfolioTag` is set **only** so the engine's `msTable` getter routes reads to `bifurcated_master_sheet_test`. Because `portfolioMapping` has no `"Total Portfolio"` key, the engine's aggregate code paths never run; `handleGET` returns a single keyed entry: `{ [strategyName]: { data, metadata } }`.

**GRD config file** — `app/lib/clients/grd.ts`:
```ts
import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const GRD_CONFIG = defineSingleStrategyClient({
  name: "GRD",
  qcode: "QAC00092",
  strategyName: "QYE++",
  inceptionDate: "2026-03-11",
  exposure: "QYE++ Total Portfolio Exposure",
  profit: "QYE++ Total Portfolio Exposure",
});
```

### 2. Registry — `renderMode` discriminator (`app/lib/bifurcated-clients-registry.ts`)

Extend `BifurcatedClientEntry`:
```ts
export interface BifurcatedClientEntry {
  icode: string;
  qcode: string;
  displayName: string;
  config: ClientConfig;
  frozenData: FrozenSchemeData;
  hasNavBasedTotalPortfolio: boolean;
  renderMode?: "multi" | "single"; // default "multi" (dropdown). "single" = no dropdown.
  broker?: string;                 // NEW — single-strategy StatsCards label (e.g. "radiance")
}
```

GRD entry appended to `BIFURCATED_CLIENTS`:
```ts
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
```

The 7 existing multi-scheme entries are untouched (`renderMode` absent ⇒ treated as `"multi"`). `findByIcode` / `findByQcode` unchanged.

### 3. API + data flow — reuse `/api/bifurcated-portfolio`

No new route. The single-strategy config causes `handleGET` to return `{ [strategyName]: { data, metadata } }` (one key). The frontend, for a `renderMode: "single"` client, fetches `/api/bifurcated-portfolio?qcode=…`, reads the single entry's `.data` (which is `Stats`/`PortfolioData`-shaped), and assigns it to the existing `stats` state — no transformation needed.

### 4. Frontend — dashboard detection + render routing (`app/dashboard/page.tsx`)

**Detection** (~line 422):
```ts
const bifurcatedClient = findByIcode(effectiveIcode);
const isSingleStrategyBifurcated = bifurcatedClient?.renderMode === "single";
// "dropdown kind" — only multi-scheme clients hit the dropdown render branch:
const isBifurcatedClient = !!bifurcatedClient && !isSingleStrategyBifurcated;
```

**Fetch:** add a branch that, when `isSingleStrategyBifurcated`, calls `/api/bifurcated-portfolio?qcode=${bifurcatedClient.qcode}`, takes the single scheme entry (`Object.values(response)[0]`, or by `bifurcatedClient.config.newSchemeName` key), and `setStats(entry.data)`. Also store the entry's `metadata` for the strategy-name badge / dates as the single-strategy path expects.

**Render:** the existing single-strategy JSX (~1555-1602) is gated on `!isBifurcatedClient && !isSarla && !isSatidham`. Since `isBifurcatedClient` is now **false** for single-strategy clients, they fall through to that branch automatically — no dropdown — provided `stats` is populated.

**Account context:** that render branch reads broker/name from `currentAccount` (populated by `fetchAccounts()`), which single-strategy bifurcated clients bypass. Audit every `currentAccount?.x` reference inside the `:1555-1602` branch and, when `isSingleStrategyBifurcated`, fall back to the registry entry's fields:
- account name ⇒ `bifurcatedClient.displayName`
- broker ⇒ `bifurcatedClient.broker`
- strategy name / dates ⇒ from the fetched entry's `metadata`.

### 5. Holdings — out of scope

`/holding-summary` behavior is unchanged for these clients. GRD has no holdings in the bifurcated holdings tables anyway. Revisit separately if a future single-strategy client needs holdings from the bifurcated tables.

## Risks & verification

**Risk A — NAV / metric parity between engines (primary).** GRD currently renders via `ZerodhaManagedStrategy` reading `master_sheet`; after this change it renders via `BifurcatedPortfolioEngine` reading `bifurcated_master_sheet_test`. These are two independently-written engines. There is **no strangler-fig "identical JSON" contract** here (unlike the multi-scheme refactor, which compared old-route vs new-route through the *same* engine). Both rebase NAV to 100 at inception, but trailing returns / drawdown / PnL are computed by different code.
- **Verification:** open GRD on the current production view and the new local view side by side; compare headline metrics (Amount Invested, Current Portfolio Value, Returns, MDD, since-inception) and the NAV curve shape. If `bifurcated_master_sheet_test` is the new authoritative source, small differences may be acceptable — decision belongs to the account owner.

**Risk B — account context fallback.** The single-strategy render reads `currentAccount` (broker, name). Single-strategy bifurcated clients bypass `fetchAccounts()`. Mitigation: source `displayName` + `broker` from the registry entry; audit all `currentAccount?.x` reads in the render branch and add the fallback. Missing one would show a blank/`undefined` label, not a crash.

**Risk C — exposure vs value tag.** GRD has both `QYE++ Total Portfolio Exposure` (end NAV 107.50) and `QYE++ Total Portfolio Value` (107.21). Spec uses `Total Portfolio Exposure` for both profit and exposure (Radiance convention). Confirm with the account owner that `Exposure` is the intended curve, since the two diverge slightly. The helper takes explicit tags, so changing this later is a one-line config edit.

**Read-only invariant:** all changes are config + frontend + a builder function. No new Prisma writes. The reused engine + route are already SELECT-only.

**Build/validate gates:**
- `npm run build` exits 0.
- `validate-bifurcated-registry.ts` must handle a `renderMode: "single"` entry: its per-scheme inception check should still pass for GRD's single scheme (deposit tag `QYE++ Total Portfolio Exposure`, MIN date 2026-03-11). The validator iterates `portfolioMapping` excluding `"Total Portfolio"` — for a single-strategy config there's no `"Total Portfolio"` key, so it checks the one scheme. The `qodeTotalPortfolioTag` presence check (`Qode Total Portfolio`, 51 rows) passes too. Confirm the validator doesn't assume a `"Total Portfolio"` key exists.

## Out of scope (explicit)

- Holdings / `/holding-summary` for these clients.
- Sarla / Satidham.
- Existing multi-scheme bifurcated clients (`renderMode` defaults to `"multi"`; zero behavior change).
- Existing single-strategy accounts on `master_sheet` via `/api/portfolio` (untouched; only registry-listed `renderMode: "single"` clients reroute).
- PMS single-strategy clients (GRD is managed/radiance; PMS uses `/api/pms-data` + custodian codes — would need a separate follow-up).

## Future work

- If more single-strategy clients are migrated, each is: one `defineSingleStrategyClient` config file + one registry entry with `renderMode: "single"`.
- Consider a `scripts/investigate-bifurcated-client.ts` enhancement to emit a `defineSingleStrategyClient` paste-ready block when it detects a single-scheme client (today it only emits the multi-scheme `defineBifurcatedClient` shape).
- Holdings-from-bifurcated for single-strategy clients, if a future client needs it.
