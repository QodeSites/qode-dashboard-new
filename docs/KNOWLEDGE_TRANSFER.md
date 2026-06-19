# Qode Dashboard — Knowledge Transfer

Onboarding doc for a new engineer joining the Qode client dashboard project. Read this top-to-bottom on day one. It is meant to be paired with `CLAUDE.md` (high-level conventions) and the inline code, not to replace them.

> **Doc currency**: written 2026-04-27 against branch `prod-new` at commit `33a4f6e`. If you find drift, update the section and bump the date.

---

## Table of Contents

1. [What this app does](#1-what-this-app-does)
2. [Tech stack & repo layout](#2-tech-stack--repo-layout)
3. [Local setup & commands](#3-local-setup--commands)
4. [Authentication, roles, and the ban list](#4-authentication-roles-and-the-ban-list)
5. [Database overview](#5-database-overview)
6. [The big picture: how a dashboard request flows](#6-the-big-picture-how-a-dashboard-request-flows)
7. [`portfolio-utils.ts` — the regular Strategy pipeline](#7-portfolio-utilsts--the-regular-strategy-pipeline)
8. [Calculation conventions (read this once, refer back forever)](#8-calculation-conventions-read-this-once-refer-back-forever)
9. [Bifurcated clients (Dinesh, Shilpa, Vikram)](#9-bifurcated-clients-dinesh-shilpa-vikram)
10. [Sarla & Satidham (`sarla-utils.ts`)](#10-sarla--satidham-sarla-utilsts)
11. [PMS-only API path (`pms-utils.ts`)](#11-pms-only-api-path-pms-utilsts)
12. [Distributor view (`distributor-utils.ts`)](#12-distributor-view-distributor-utilsts)
13. [AUM card (`aum-utils.ts`)](#13-aum-card-aum-utilsts)
14. [API route catalog](#14-api-route-catalog)
15. [Page route catalog](#15-page-route-catalog)
16. [Components & UI](#16-components--ui)
17. [External integrations](#17-external-integrations)
18. [Scripts and source CSVs](#18-scripts-and-source-csvs)
19. [Common tasks (recipes)](#19-common-tasks-recipes)
20. [Gotchas & footguns](#20-gotchas--footguns)
21. [Onboarding checklist](#21-onboarding-checklist)
22. [Drift in `CLAUDE.md`](#22-drift-in-claudemd)

---

## 1. What this app does

The Qode dashboard is a **read-only** client portal for a portfolio management business. Each client logs in, sees their accounts, and views NAV curves, drawdown, monthly/quarterly P&L, holdings, and trailing returns. There is also an admin role (impersonate + AUM overview) and a distributor role (sanitised strategy showcase for sales).

Three things make the codebase non-trivial:

1. **Multiple account types** (PMS, Zerodha-managed, Jainam-managed, Radiance-managed) each with different tables / system tags / calculation rules. A Strategy pattern unifies them in `portfolio-utils.ts`.
2. **A handful of high-value clients have bespoke logic** that bypasses the Strategy pattern entirely: Sarla & Satidham (multi-scheme aggregation), and Dinesh/Shilpa/Vikram (bifurcated old→new scheme migration). Each lives in its own utils file with its own API route.
3. **Frozen historical data** for closed schemes is hardcoded into `.ts` files, generated from CSVs in `data/`. The "Total Portfolio" view splices frozen + live data together.

**This is a read-only system.** No code in `app/lib/` or `app/api/` should ever call `create`, `update`, `delete`, `upsert`, or `$executeRaw` with mutations. See `CLAUDE.md` § Database Safety Rules.

---

## 2. Tech stack & repo layout

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| Auth | NextAuth v4 (credentials provider, JWT sessions) |
| DB | PostgreSQL via Prisma 6 (`multiSchema` preview) |
| Styling | Tailwind 3 + shadcn/ui (Radix primitives) |
| Charts | Recharts + ApexCharts + Highcharts (yes, three — partial migration) |
| Excel/PDF | `xlsx-js-style` for Excel; print-to-PDF via HTML for reports |
| External | Zoho CRM (singleton SDK in `lib/zoho-sdk.ts`), Ghost CMS (blog) |

```
qode-dashboard-new/
├── app/                       # Next.js App Router
│   ├── api/                   # All API routes (see §14)
│   ├── dashboard/             # Main client dashboard page
│   ├── admin/, distributor/   # Role-specific pages
│   ├── home/, holding-summary/, personal-details/, quarterly-fees/
│   └── lib/                   # ← Server-side data layer (most logic lives here)
├── components/
│   ├── ui/                    # shadcn/ui primitives (52 files)
│   ├── dashboard/             # Dashboard-specific composites
│   └── *.tsx                  # Top-level shared components (header, sidebar, charts, tables)
├── hooks/                     # use-mobile, useBse500Data (NIFTY 50 benchmark)
├── lib/
│   ├── prisma.ts              # Prisma singleton
│   ├── zoho-sdk.ts            # Zoho CRM client (singleton, auto-refresh)
│   └── blocked-icodes.ts      # Hardcoded ban list
├── middleware.ts              # Ban-list enforcement on every request
├── prisma/schema.prisma       # 739-line schema, ~40 models
├── types/next-auth.d.ts       # Session/JWT type augmentation
├── data/                      # Source CSVs for hardcoded frozen scheme data
├── scripts/                   # Diagnostic + data-extraction scripts (read-only)
├── docs/                      # adding-frozen-scheme-guide.md + this file
└── CLAUDE.md                  # Project conventions for AI assistants (read first)
```

**Path alias**: `@/*` resolves to repo root. So `@/app/lib/portfolio-utils` is `app/lib/portfolio-utils.ts`.

---

## 3. Local setup & commands

```bash
npm install                  # use --legacy-peer-deps if you hit peer conflicts
npx prisma generate          # generate Prisma client
npm run dev                  # starts on http://localhost:3020  (NOT 3000)
npm run build                # production build (TS + ESLint errors are ignored — see next.config.mjs)
npm run start                # serve the build
npm run lint                 # ESLint
npx prisma studio            # DB browser
npx prisma db push           # push schema changes (rare — this app is mostly read-only against an existing DB)
```

**`.env` keys you need** (copy from a teammate, no `.env.example` is committed):

- `DATABASE_URL` — Postgres connection string
- `NEXTAUTH_SECRET`, `JWT_SECRET` — session signing
- `ADMIN_EMAILS`, `ADMIN_PASSWORDS` — comma-separated, plain text (yes, plain — see §4 footgun)
- `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_DC` (default `com`, we use `in`), `ZOHO_REDIRECT_URI`, `ZOHO_REFRESH_TOKEN`, `ZOHO_SCOPE`
- `NEXT_PUBLIC_GHOST_BLOG_KEY`, `NEXT_PUBLIC_APP_URL`
- `NODE_ENV` — controls `_test` table selection (see §5)

**Docker**: there's a multi-stage `Dockerfile` (node:20-alpine builder + runner, runs as non-root, healthcheck on port 3000 — note the port mismatch with dev).

---

## 4. Authentication, roles, and the ban list

**File**: `app/api/auth/[...nextauth]/route.ts`

NextAuth with a single `CredentialsProvider` that fans out into three login paths inside `authorize()`:

| Login path | Identifier | Password source | `accessType` returned |
|---|---|---|---|
| Admin | email in `ADMIN_EMAILS` | `ADMIN_PASSWORDS` (env) | `"admin"` |
| Distributor | `live@qodeinvest.com` (hardcoded at route.ts:44) | hardcoded | `"distributor"` |
| Client | email **or** icode | `clients.password` column (plain text) | `"client"` |

### Session shape (after `types/next-auth.d.ts` augmentation)

```ts
session.user = {
  icode?: string,       // e.g. "QUS0007"
  name?: string|null,
  email?: string|null,
  accessType?: "admin" | "client" | "distributor",
  impersonating?: { icode, name, email } | null   // admin-only
}
```

### Admin impersonation

Admins can impersonate a client to debug their dashboard. The flow:

1. Admin hits `POST /api/admin/impersonate` with a target icode.
2. `session.impersonating` is set via NextAuth's `update` trigger (route.ts:98-105).
3. All downstream code calls `getEffectiveIcode(session)` from `app/lib/admin-utils.ts:33` which returns the impersonated icode if `accessType === "admin"`, else the user's own icode.
4. UI shows `ImpersonationBanner` while active.

**Always use `getEffectiveIcode()` in API routes — never `session.user.icode` directly** — or admin impersonation breaks.

### Ban list (two layers)

**Layer 1 — login refusal** (`route.ts:69-71`): if a client tries to log in with an icode in `BLOCKED_ICODES`, `authorize()` returns `null` and login fails silently.

**Layer 2 — middleware sign-out** (`middleware.ts`): on every request, the JWT is decoded; if `token.icode` is in `BLOCKED_ICODES`, the user is redirected to `/` and **both session cookies** (`next-auth.session-token` and `__Secure-next-auth.session-token`) are deleted. This signs out users who were already logged in *before* they got banned.

**Ban list source of truth**: `lib/blocked-icodes.ts` — a hardcoded `Set<string>`. Currently bans `QUS00078, QUS00089, QUS00098, QUS00082, QUS00083, QUS00114`. Editing the set + redeploying is the only ban mechanism.

### Auth helpers (`app/lib/admin-utils.ts`, only 43 lines, read it)

- `requireAdmin()` — returns `{ session }` or `{ error, status: 403 }`
- `requireDistributor()` — same for distributors
- `getEffectiveIcode(session)` — handles impersonation, returns `null` if unauthenticated

---

## 5. Database overview

**File**: `prisma/schema.prisma` (~740 lines, ~40 models). Skim the whole file once. Highlights:

### Identity & access

| Table | Key | Purpose |
|---|---|---|
| `clients` | `icode` (e.g. `QUS0007`) | Investor records. `password` is **plain text**. |
| `accounts` | `qcode` (e.g. `QAC00041`) | Trading accounts. Has `account_type`, `broker`, `strategy`. |
| `pooled_account_users` | `(qcode, icode)` | Direct user→account access. |
| `pooled_account_allocations` | `(qcode, icode, allocation_date)` | Allocation-share access (pooled accounts). |
| `account_custodian_codes` | `(qcode, custodian_code)` | PMS-only: maps a qcode to one or more custodian codes. PMS data is keyed by custodian, not qcode. |
| `account_aum` | `qcode` | Precomputed AUM (see §13). |

### Portfolio data (the hot tables)

| Table | Used by | Keyed by |
|---|---|---|
| `master_sheet` | Zerodha/Jainam/Radiance managed accounts, distributor view, Sarla, bifurcated | `(qcode, system_tag, date)` |
| `pms_master_sheet` | PMS accounts only | `(account_code, report_date)` — **note: column is `account_code`, holding the custodian code** |
| `equity_holding` | All account types | `qcode` (or custodian code for PMS) |
| `mutual_fund_holding_sheet` | All account types | `qcode` |
| `capital_in_out` | Cash flow audit | `(qcode, date, system_tag)` |

### Test vs live tables

In `NODE_ENV === 'development'` the code reads from `master_sheet_test`, `equity_holding_test`, `mutual_fund_holding_sheet_test`. The `_test` tables are staging; the team manually syncs them to production tables. **`clients`, `accounts`, `pooled_account_users` have no `_test` variant — they are shared.**

### Identifier conventions

| Format | What it is | Example |
|---|---|---|
| `QUS####` or `QUS#####` | client (`icode`) | `QUS0007`, `QUS00081` |
| `QAC#####` | account (`qcode`) | `QAC00041` |
| `QAW#####` | PMS custodian code | `QAW00041` |
| `AC#` | Sarla/Satidham scheme-set selector | `AC5` (Sarla), `AC8` (Satidham) |

### `system_tag` is the single most important column

In `master_sheet`, each `(qcode, date)` pair can have many rows — one per `system_tag`. The tag identifies *which series* of NAV/portfolio values the row belongs to. A wrong tag silently returns zero rows. See §7 and §10 for the tag mappings each strategy uses.

---

## 6. The big picture: how a dashboard request flows

```
User logs in → NextAuth issues JWT with { icode, accessType }
       │
       ▼
GET /dashboard  →  page.tsx checks effectiveIcode
       │
       ├── isSarla (QUS0007)        → fetch /api/sarla-api?qcode=QAC00041 ─→ sarla-utils.ts
       ├── isSatidham (QUS0010)     → fetch /api/sarla-api?qcode=QAC00046 ─→ sarla-utils.ts
       ├── isDinesh (QUS00072)      → fetch /api/dinesh-api               ─→ bifurcated-portfolio-utils.ts (DineshApi)
       ├── isShilpa (QUS00067)      → fetch /api/shilpa-api               ─→ bifurcated-portfolio-utils.ts (ShilpaApi)
       ├── isVikram (QUS00068)      → fetch /api/vikram-api               ─→ bifurcated-portfolio-utils.ts (VikramApi)
       │
       └── everyone else            → fetch /api/accounts (list)
                                    → user picks an account
                                       │
                                       ├── PMS account     → /api/pms-data    → pms-utils.ts
                                       └── Managed/Prop    → /api/portfolio   → portfolio-utils.ts (Strategy pattern)
```

Five parallel data layers. The branching happens at `app/dashboard/page.tsx:418-422` (the `isSarla/isSatidham/isDinesh/isShilpa/isVikram` flags). Adding a new "special" client is a matter of adding a flag + an API route.

---

## 7. `portfolio-utils.ts` — the regular Strategy pipeline

**File**: `app/lib/portfolio-utils.ts` (1641 lines). Used by everyone who is *not* a special client.

### The Strategy interface (`portfolio-utils.ts:108-119`)

```ts
interface DataFetchingStrategy {
  getAmountDeposited(qcode): Promise<number>;
  getLatestExposure(qcode): Promise<{ portfolioValue, drawdown, nav, date } | null>;
  getPortfolioReturns(qcode, strategy?): Promise<number>;
  getTotalProfit(qcode, strategy?): Promise<number>;
  getHistoricalData(qcode, strategy?): Promise<{ date, nav, drawdown, pnl, capitalInOut }[]>;
  getFirstNav(qcode, strategy?): Promise<{ nav, date } | null>;
  getNavAtDate(qcode, target, dir): Promise<{ nav, date } | null>;
  getCashFlows?(qcode): Promise<{ date, amount }[]>;   // optional
  getStrategyName(strategy?): string;
  getHoldings(qcode): Promise<Holding[]>;
}
```

### Strategy selection (`portfolio-utils.ts:946-955`)

```ts
function getDataFetchingStrategy(account) {
  if (account.account_type === 'pms')                                     return new PmsStrategy();
  if (account.account_type === 'managed_account' && account.broker === 'jainam')  return new JainamManagedStrategy();
  if (account.account_type === 'managed_account' && (broker === 'zerodha' || broker === 'radiance'))
                                                                          return new ZerodhaManagedStrategy(broker);
  throw new Error(`Unsupported ...`);
}
```

### The three strategies, side-by-side

| | **PmsStrategy** (573-793) | **ZerodhaManagedStrategy** (319-571) | **JainamManagedStrategy** (122-318) |
|---|---|---|---|
| Table | `pms_master_sheet` | `master_sheet` | `master_sheet` |
| Date column | `report_date` | `date` | `date` |
| Filter key | `account_code IN custodian_codes` | `qcode + system_tag` | `qcode + system_tag` |
| Deposit tag | n/a — sums `cash_in_out` | varies by strategy (see below) | `"Jainam Total Portfolio Deposit"` |
| Exposure tag | n/a | varies by strategy | `"Jainam Total Portfolio Exposure"` |
| Holdings filter | `qcode IN custodian_codes` | by `qcode` | by `qcode` |
| Inception override? | no | **yes** (`ACCOUNT_INCEPTION_OVERRIDES`) | no |
| Initial-NAV normalisation? | no | **yes** (line 389: if first NAV ≠ 100, treat as 100) | no |
| Strategy param respected? | ignored | **yes** | ignored |

### Zerodha system_tag mapping (`portfolio-utils.ts:327-341`)

If broker = `radiance`, the tag is **always** `"Total Portfolio Exposure"` — strategy is ignored. Otherwise, by `strategy` field:

| Strategy code | system_tag |
|---|---|
| `QAW+`, `QAW++`, `QTF+`, `QTF++` | `"Zerodha Total Portfolio"` |
| `QYE+`, `QYE++` | `"Total Portfolio Value"` |
| anything else | `"Zerodha Total Portfolio"` (default) |

### Inception overrides (`portfolio-utils.ts:12-17`, ZerodhaManagedStrategy only)

```ts
const ACCOUNT_INCEPTION_OVERRIDES = {
  'QAC00071': { date: new Date('2026-01-14'), nav: 100 },
};
```

When set, the override date/NAV is prepended to the historical series and used as the start point for return calculations. Add new entries here if a Zerodha account "starts" later than its first DB row.

### Aggregation across multiple accounts (`portfolio-utils.ts:1015-1599`)

`calculatePortfolioMetrics(qcodesWithDetails[])`:

1. Look up all qcodes for the user via `getUserQcodes(icode)` (joins `pooled_account_users` ∪ `pooled_account_allocations`).
2. For each qcode, instantiate the right strategy, call all the methods.
3. Sum deposits / exposures / profits across accounts.
4. Average NAVs by date to build a single equity curve. Prepend NAV=100 baseline if the first point isn't 100 (lines 1103-1114 per-account, 1205-1211 aggregated).
5. Compute trailing returns (5d / 10d / 15d / 1m / 3m / 6m / 1y / 2y / 5y / sinceInception / MDD / currentDD).
6. Compute monthly P&L per `(year, month)`, then yearly = compounded monthly.
7. Compute quarterly P&L (Q1=Jan-Mar etc.), again compounded from monthly.
8. Concatenate strategy names with " + " if multiple (line 1532-1540: `"Qode All Weather+ + Qode Yield Enhancer+"`).

`formatPortfolioStats(metrics)` (lines 1602-1641) ensures every field exists with a sensible default, returning the `Stats` type.

### What gets returned: `Stats` (`dashboard-types.ts`, summarised at `portfolio-utils.ts:65-105`)

```ts
{
  amountDeposited, currentExposure, return, totalProfit,    // all formatted strings
  trailingReturns: { fiveDays, tenDays, ..., sinceInception, MDD, currentDD },
  drawdown,
  equityCurve:    [{ date, value }],
  drawdownCurve:  [{ date, value }],
  quarterlyPnl:   { [year]: { percent, cash, yearCash } },
  monthlyPnl:     { [year]: { months, totalPercent, totalCash, totalCapitalInOut } },
  cashFlows:      [{ date, amount }],
  strategyName,
  holdings?:      HoldingsSummary       // equityHoldings, debtHoldings, mutualFundHoldings, breakdowns
}
```

> **All numeric values come out as strings.** `"-"` means "no data". Don't `Number()` blindly — check for `"-"` first.

---

## 8. Calculation conventions (read this once, refer back forever)

These conventions are repeated in every util file. Internalise them.

### Returns: absolute vs CAGR

```
days = (endDate - startDate) in days
if days < 365:   return = (finalNav / initialNav − 1) × 100
if days ≥ 365:   return = (finalNav / initialNav) ^ (365 / days) − 1) × 100   // CAGR
```

Trailing periods (`5d`, `1m`, `3m`, ..., `5y`) **always** use absolute. Only `sinceInception` switches to CAGR when ≥ 365 days (`portfolio-utils.ts:1508-1509`).

### NAV-100 baseline

Equity curves should start at NAV=100. If the first row in the DB isn't 100, the code prepends a synthetic row: `{ date: firstDate − 1 day, nav: 100, drawdown: 0, pnl: 0, capitalInOut: 0 }`. This happens both per-account and on the aggregated curve.

### Drawdown

```
peakNav = running max of NAV
drawdown(t) = (peakNav − nav(t)) / peakNav × 100         // always reported as positive %
MDD         = max(drawdown(t)) over all t
currentDD   = drawdown at the latest data point
```

`Math.abs(drawdown)` is applied to DB values everywhere (PMS line 601, Zerodha line 362, Jainam line 141) because the DB sometimes stores them negative.

### Monthly → yearly compounding

```
yearReturn = ∏(1 + monthlyReturn_i / 100) − 1 × 100
```

Months that report `"-"` (no data) are **skipped**, not zeroed. Same for quarterly compounding.

### Decimal vs Number

Prisma returns `capital_in_out` as `Decimal`. Always `.toNumber()` before doing arithmetic. `nav` / `portfolio_value` come back as numbers and are safe.

### `getNavEntriesAgo()` (`portfolio-utils.ts:985-1013`)

For trailing-window calculations: given an equity curve and N days back, find the **last** data point on or before `latestDate − N`. Used for non-trading-day alignment (weekends, holidays).

---

## 9. Bifurcated clients (Dinesh, Shilpa, Vikram)

> "Bifurcated" = the client's history is split into a frozen old-scheme period (data hardcoded in code) and a live new-scheme period (queried from DB). The dashboard shows them stitched together as one continuous "Total Portfolio" view.

**Files**:
- `app/lib/bifurcated-portfolio-utils.ts` (1275 lines) — the unified engine
- `app/lib/bifurcated-portfolio-data.ts` (1437 lines) — frozen data for all three
- `app/lib/dinesh-utils.ts` (1174 lines) — **older Dinesh-only implementation**, looks like dead code (see §20)

### Client config table

| Client | icode | qcode | accountCode | Old scheme | New scheme | Migration date | Old final NAV |
|---|---|---|---|---|---|---|---|
| Dinesh | QUS00072 | QAC00053 | AC9 | QTF | QAW++ | 2026-01-12 | 113.57 |
| Shilpa | QUS00067 | QAC00040 | AC10 | QYE+ | QYE++ | 2026-02-05 | 110.43 |
| Vikram | QUS00068 | QAC00043 | AC11 | QYE+ | QYE++ | 2026-01-14 | 106.02 |

The full configs are at `bifurcated-portfolio-utils.ts:106-138` (Dinesh), `:140-172` (Shilpa), `:174-206` (Vikram).

### How bifurcation works

The engine (`BifurcatedPortfolioEngine` class) iterates three schemes for each client: `["Total Portfolio", newSchemeName, oldSchemeName]`.

- **Old scheme** view: returns the frozen data verbatim from `bifurcated-portfolio-data.ts`.
- **New scheme** view: queries `master_sheet` from `newStartDate` onwards. Prepends a synthetic baseline `{ day before newStartDate, nav: 100 }`.
- **Total Portfolio** view: combines both. The new-scheme NAVs are **rebased** so they continue smoothly from where the old scheme ended:

  ```
  rebaseMultiplier = oldFinalNav / 100        // e.g. 113.57 / 100 = 1.1357
  newNav_displayed = newNav_raw * rebaseMultiplier
  ```

  So if the new scheme's DB NAV is 100 on day one, it appears as 113.57 on the Total Portfolio chart.

### Shared-tag vs different-tag accounts

| Client | Old `system_tag` | New `system_tag` | Effect |
|---|---|---|---|
| Dinesh | `"QTF Zerodha Total Portfolio"` | `"Zerodha Total Portfolio"` | Different tags → must merge frozen + DB explicitly. |
| Shilpa, Vikram | `"Total Portfolio Value"` | `"Total Portfolio Value"` | Same tag → DB queries cover both periods naturally. |

This distinction matters for `prevNav` handling in the new-scheme return calc (`bifurcated-portfolio-utils.ts:566-590`): shared-tag accounts use prevNav as the start NAV of month 1 of the new scheme; different-tag accounts treat the new scheme as starting at NAV=100.

### API entry

```
/api/dinesh-api?qcode=QAC00053  → DineshApi.GET   → engine.handleGET()
/api/shilpa-api?qcode=QAC00040  → ShilpaApi.GET
/api/vikram-api?qcode=QAC00043  → VikramApi.GET
```

All three are thin wrappers around `BifurcatedPortfolioEngine.handleGET` (`bifurcated-portfolio-utils.ts:1092-1249`).

### Frozen data structure

For each client, `bifurcated-portfolio-data.ts` holds a `FrozenSchemeData` with: equity curve (~100-160 daily points), drawdown curve, quarterly PnL, monthly PnL, cash flows. **`pnl` and `capitalInOut` are hardcoded to 0 in the per-day frozen data** (`bifurcated-portfolio-utils.ts:2261-2268` equivalent) — only the aggregated monthly/quarterly buckets carry real cash numbers. So daily P&L charts will be blank for old-scheme periods.

### Adding a new bifurcated client

1. Drop their CSV into `data/`.
2. Run `node scripts/generate-bifurcated-data.js` to extract frozen data.
3. Add a `*_FROZEN_DATA` const to `bifurcated-portfolio-data.ts`.
4. Add a `<NAME>_CONFIG` to `bifurcated-portfolio-utils.ts` and instantiate `new BifurcatedPortfolioEngine(config, frozenData)`.
5. Export an `<Name>Api = { GET: (req) => engine.handleGET(req) }`.
6. Create `app/api/<name>-api/route.ts` that re-exports `<Name>Api.GET`.
7. Add an `is<Name>` flag in `app/dashboard/page.tsx:418-422` and a fetch branch.

See `docs/adding-frozen-scheme-guide.md` for the full step-by-step.

---

## 10. Sarla & Satidham (`sarla-utils.ts`)

**File**: `app/lib/sarla-utils.ts` (~3677 lines). The largest single file in the codebase. Two clients, six-ish schemes each, lots of hardcoded fixtures.

**Important**: do not assume sarla-utils mirrors `portfolio-utils.ts` — it does its own thing. Read the existing scheme handlers before adding anything.

### The two clients

| Client | icode | qcode | `accountCode` selector | PMS custodian |
|---|---|---|---|---|
| Sarla Performance Fibers | QUS0007 | QAC00041 | `AC5` | QAW00041 |
| Satidham (old) | QUS0010 | QAC00046 | `AC8` | QAW00041 |
| Satidham (new) | QUS00081 | QAC00066 | (linked via Satidham's `Scheme QAW++ QUS00081`) | — |

The selector logic is at `sarla-utils.ts:3344`:
```ts
accountCode = qcode === "QAC00046" ? "AC8" : "AC5";
```

### Scheme → system_tag mapping (`PORTFOLIO_MAPPING`, `SARLA_SYSTEM_TAGS`, `SATIDHAM_SYSTEM_TAGS`)

**Sarla (AC5)**:

| Scheme | system_tag | Active? |
|---|---|---|
| Total Portfolio | `Sarla Performance fibers Scheme Total Portfolio` | yes |
| Scheme B | `Total Portfolio Value` | yes |
| Scheme QAW | `Zerodha Total Portfolio QAW` | no (frozen) |
| Scheme A | `Zerodha Total Portfolio A` | no (frozen) |
| Scheme PMS QAW | `PMS QAW Portfolio` | no (frozen) |

**Satidham (AC8)**:

| Scheme | system_tag | Source qcode |
|---|---|---|
| Total Portfolio | `Total Portfolio Value A` | QAC00046 |
| Scheme A | `Total Portfolio Value A` | QAC00046 |
| Scheme B | `Total Portfolio Value B` | QAC00046 |
| Scheme A (Old) | `Total Portfolio Value Old` | QAC00046 |
| Scheme PMS QAW | `PMS QAW Portfolio` | QAC00046 |
| **Scheme QAW++ QUS00081** | `Zerodha Total Portfolio` | **QAC00066** ← override |

### Cross-account fetching (`SCHEME_QCODE_OVERRIDE`)

```ts
private static readonly SCHEME_QCODE_OVERRIDE = {
  "Scheme QAW++ QUS00081": "QAC00066",
};
```

A scheme listed under Satidham's view actually pulls its data from a different qcode. Always go through `getEffectiveQcode(scheme)` rather than using `qcode` directly. Holdings and metrics for that scheme come from QAC00066.

### Hardcoded fixtures

This file has *lots* of hardcoded data:

- `AC5_QUARTERLY_PNL` (sarla-utils.ts:237) — Sarla quarterly P&L hardcoded **up to Q2 2025**. From Q3 2025 onwards, values are computed from the DB.
- `AC8_QUARTERLY_PNL` (sarla-utils.ts:263) — same for Satidham.
- `PMS_QAW_Q2_2025_VALUE = 10336722.03` (~line 279) — special override for one quarter.
- `HARDCODED_SINCE_INCEPTION_RETURNS` — hardcoded sinceInception trailing returns per scheme.
- Frozen equity curves / monthly P&L for inactive schemes (Sarla has 6 inactive, Satidham has 2; data baked in around lines 1638+).

**The hardcoded Q2-2025 cutover**: aggregations use hardcoded values up to Q2 2025 then dynamic from Q3 2025+. If you change one of the AC5/AC8 hardcoded values you must also update `PMS_QAW_Q2_2025_VALUE` or the Total Portfolio sum will not equal the sum of its parts.

### Aggregation order — keep all schemes in all methods

When the user picks "Total Portfolio", these methods iterate scheme arrays and sum:

- `getAmountDeposited()`
- `getLatestExposure()`
- `getTotalProfit()`
- `getCashFlows()`
- `calculateMonthlyPnL()`
- `calculateQuarterlyPnLWithDailyPL()`

The arrays are duplicated across methods (and not in identical order — see `sarla-utils.ts:1879, 1972` etc.). When you add or rename a scheme, **grep for the old name and update every list**. Forgetting one means Total Portfolio under-counts silently.

### Entry point

```
/api/sarla-api?qcode=QAC00041&accountCode=AC5  →  PortfolioApi.GET (sarla-utils.ts:3337-3495)
```

The route file (`app/api/sarla-api/route.ts`) is just `export const GET = PortfolioApi.GET`.

The response is keyed by scheme name:
```ts
{
  "Total Portfolio": { data: PortfolioData, metadata: Metadata },
  "Scheme B":         { data, metadata },
  "Scheme A":         { data, metadata },
  ...
}
```

The dashboard component lets the user select a scheme via the URL `accountCode` param.

### Adding a new Sarla/Satidham scheme

See `CLAUDE.md` § "Adding a New Scheme to Sarla/Satidham" for the exact checklist. Short version: update `PORTFOLIO_MAPPING`, the system-tag map, optionally `SCHEME_QCODE_OVERRIDE`, and **every aggregation array**.

---

## 11. PMS-only API path (`pms-utils.ts`)

**File**: `app/lib/pms-utils.ts` (665 lines). Served by `/api/pms-data`. Used when a PMS account is selected from the regular accounts dropdown.

### Why does this exist alongside `PmsStrategy`?

`PmsStrategy` (in portfolio-utils.ts) implements the generic interface. `pms-utils.ts` is a **separate, parallel** PMS implementation with extra features the generic flow doesn't have:

- Period filters: `today`, `yesterday`, `this_week`, `this_month`, `this_year`, `last_week` (`calculateDateRange()` at `pms-utils.ts:80`)
- Multi-custodian aggregation (averages NAV/drawdown across all custodian codes for a qcode)
- `findNAVRecordOnOrBefore()` for trading-day-aware trailing returns
- Equity curve normalisation: `(avgNav / baseNAV) * 100` where `baseNAV` is day-1 NAV (or 100 if missing — line 546)

It is **not** invoked from `PmsStrategy`. They're independent code paths. `/api/portfolio` uses `PmsStrategy`, `/api/pms-data` uses `getPmsData()`. The dashboard page picks based on view mode.

### Entry point

```ts
// app/api/pms-data/route.ts
const session = await getServerSession(authOptions);
const icode   = getEffectiveIcode(session);
const params  = { qcode, view_type, period, data_as_of, start_date, end_date };
return NextResponse.json(await getPmsData(icode, ...params));
```

`getPmsData()` returns a `PmsStats` object whose shape is *not* the same as the regular `Stats` — the dashboard normalises it via `convertPmsStatsToStats()` (`app/dashboard/page.tsx:134-185`).

---

## 12. Distributor view (`distributor-utils.ts`)

**File**: `app/lib/distributor-utils.ts` (911 lines). For the sales/distributor role.

### What distributors see

Three pre-canned strategy showcases, all client identities scrubbed to "Client A/B/C", **rupee values hidden or zeroed** — only percentage performance is exposed.

| Strategy slug | Display name | Underlying account(s) | Function |
|---|---|---|---|
| `qye` | Client A — QYE++ | Deepti Parikh (QAC00022) | `getQyeStats()` (line 600) |
| `qaw` | Client B — QAW++ (spliced) | Krishnan Iyer (QAC00055) → Dinesh QAW++ (QAC00053) from 2026-01-21 | `getQawStats()` (line 776) |
| `qyeplus` | Client C — QYE+ | Sarla Scheme B (QAC00041) | `getQyePlusStats()` (line 648) |

### The QAW splice (`distributor-utils.ts:776-877`)

To showcase a long-history version of the QAW++ strategy, the file stitches Krishnan's curve (long history, standard pipeline) with Dinesh's QAW++ portion (recent, fetched via `DineshApi.GET` for parity with the regular Dinesh dashboard):

```
Krishnan curve up to 2026-01-20, then
Dinesh curve rebased: dineshNav * (krishnan_last_nav / dinesh_first_nav)
```

### Entry

```
/api/distributor/portfolio?strategy=qye|qaw|qyeplus
```

Auth gated by `requireDistributor()` from `admin-utils.ts`.

### Why not just call `PortfolioApi.GET` for QYE+?

`PortfolioApi.GET` (sarla-utils) fetches all 5+ Sarla schemes — slow. `getQyePlusStats()` queries `master_sheet` directly with the pinned qcode + tag (single scheme) — fast. The metrics are then derived client-side via `computeDerivedMetrics()` (line 519).

---

## 13. AUM card (`aum-utils.ts`)

**File**: `app/lib/aum-utils.ts` (249 lines). Added in PR #65 (commit `33a4f6e`) for the admin AUM overview card.

### What it does

Maintains a precomputed `account_aum` table so the admin dashboard can display total AUM and per-account ranking without scanning `master_sheet` on every request.

### Constants you'll touch

- `MANAGED_ACCOUNTS_LIST` (line 10-34) — the 24 qcodes that count toward AUM.
- `EXCLUDED_QCODES` (line 7) — `["QAC00066"]`, excluded to prevent double-counting (it's a Satidham sub-account).
- `SPECIAL_QCODES` (line 6) — `["QAC00041", "QAC00046"]` — Sarla & Satidham, fetched via `PortfolioApi.getLatestExposure()` instead of `master_sheet`.
- `different_cases` (line 36-52) — per-account `system_tag` overrides for the latest-portfolio-value query.

### Refresh flow

1. `GET /api/admin/stats` calls `updateAccountAUMs()` if `account_aum` is empty or stale (currently `shouldRun = true` is hardcoded for dev — see line 52).
2. `updateAccountAUMs()` (line 80) truncates `account_aum`, then for each managed account:
   - Picks the right `system_tag` via `getSystemTagForManagedAccountAUM()` (line 54).
   - Queries `master_sheet` for the latest `portfolio_value`.
   - Upserts into `account_aum`.
3. Sarla & Satidham are handled separately (lines 165-218) — they go through `sarla-utils`'s `PortfolioApi`.

### Read APIs

- `getTotalAUM()` (line 224) — `SUM(aum)` from `account_aum`.
- `getAUMAccounts()` (line 235) — sorted list of `{qcode, name, aum}` for the UI.

### Adding a new account to AUM

1. Insert into `accounts` table.
2. Add the qcode to `MANAGED_ACCOUNTS_LIST`.
3. If it doesn't use the default `system_tag`, add it to `different_cases`.
4. Hit `/api/admin/stats` to trigger a refresh.

---

## 14. API route catalog

All routes are under `app/api/`. Auth-gated routes use `getServerSession(authOptions)` + `getEffectiveIcode(session)` (or `requireAdmin()` / `requireDistributor()`).

### Authentication

| Route | File | Notes |
|---|---|---|
| `POST /api/auth/[...nextauth]` | `app/api/auth/[...nextauth]/route.ts` | NextAuth credentials endpoint |

### Client portfolio data

| Route | File | Calls into |
|---|---|---|
| `GET /api/accounts` | `accounts/route.ts` | Direct Prisma (lists accessible accounts) |
| `GET /api/portfolio` | `portfolio/route.ts` | `portfolio-utils.ts` (Strategy pattern) |
| `GET /api/pms-data` | `pms-data/route.ts` | `pms-utils.ts` |
| `GET /api/dashboard/stats` | `dashboard/stats/route.ts` | `portfolio-utils.ts` (subset) |
| `POST /api/export-csv` | `export-csv/route.ts` | Streaming CSV of `master_sheet` for given qcodes |

### Special-client routes

| Route | File | Calls into |
|---|---|---|
| `GET /api/sarla-api` | `sarla-api/route.ts` | `sarla-utils.ts → PortfolioApi.GET` |
| `GET /api/dinesh-api` | `dinesh-api/route.ts` | `bifurcated-portfolio-utils.ts → DineshApi.GET` |
| `GET /api/shilpa-api` | `shilpa-api/route.ts` | `bifurcated-portfolio-utils.ts → ShilpaApi.GET` |
| `GET /api/vikram-api` | `vikram-api/route.ts` | `bifurcated-portfolio-utils.ts → VikramApi.GET` |

### Admin

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/admin/clients` | `requireAdmin` | List/search clients |
| `POST /api/admin/impersonate` | `requireAdmin` | Set `session.impersonating` |
| `GET /api/admin/stats` | `requireAdmin` | Total clients/accounts/AUM; triggers `updateAccountAUMs()` |

### Distributor

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/distributor/portfolio?strategy=qye\|qaw\|qyeplus` | `requireDistributor` | One of `getQyeStats / getQawStats / getQyePlusStats` |

### Zoho integration

| Route | Purpose |
|---|---|
| `GET /api/zoho/auth` | OAuth2 initiation |
| `GET /api/zoho/callback` | OAuth2 callback |
| `GET /api/zoho/accounts` | Sync from CRM |

> **Heads up: there is no `/api/prop` directory.** `CLAUDE.md` references prop accounts and `/api/prop/default-tags` but that code is no longer in the tree. Treat the prop-accounts section of `CLAUDE.md` as stale.

---

## 15. Page route catalog

| Route | File | Who can see it |
|---|---|---|
| `/` | `app/page.tsx` | Redirects by `accessType` (admin → /admin, distributor → /distributor, client → /home or /dashboard) |
| `/login` | `components/login-page.tsx` | Public |
| `/dashboard` | `app/dashboard/page.tsx` | Clients (and admins via impersonation) |
| `/home` | `app/home/page.tsx` | Clients — landing page with blog carousel (Ghost CMS) |
| `/holding-summary` | `app/holding-summary/page.tsx` | Clients — full holdings table with filter/sort/Excel export |
| `/personal-details` | `app/personal-details/page.tsx` | Clients — Zoho-sourced KYC fields |
| `/quarterly-fees` | `app/quarterly-fees/page.tsx` | **Sarla only** (`QUS0007` gate) |
| `/admin` | `app/admin/page.tsx` | Admins |
| `/distributor` | `app/distributor/page.tsx` | Distributors — strategy picker |
| `/distributor/[strategy]` | `app/distributor/[strategy]/page.tsx` | Distributors — `qye \| qaw \| qyeplus` |

Layouts: `app/layout.tsx` (root, fonts + providers), then per-section layouts in `app/dashboard/`, `app/admin/`, `app/distributor/`.

---

## 16. Components & UI

### `app/dashboard/page.tsx` (1606 lines)

The dispatcher. Branching at lines 418-422:
```ts
const isSarla    = effectiveIcode === "QUS0007";
const isSatidham = effectiveIcode === "QUS0010";
const isDinesh   = effectiveIcode === "QUS00072";
const isShilpa   = effectiveIcode === "QUS00067";
const isVikram   = effectiveIcode === "QUS00068";
```

Each branch fetches from its API and renders one of:

- `renderSarlaContent()` (~line 1080)
- `renderSatidhamContent()` (~line 1161)
- `renderDineshContent()` (~line 1249) — also serves Shilpa & Vikram
- Default: `<StatsCards/>`, `<RevenueChart/>`, `<PnlTable/>`, `<StockTable/>` for regular accounts

### Key composite components (`components/`)

| Component | Purpose |
|---|---|
| `StatsCards` | Top KPI cards (deposited, exposure, return, drawdown, fees) |
| `RevenueChart` | Equity curve + drawdown overlay; supports BSE 500 / NIFTY benchmark |
| `PnlTable` | Quarterly + monthly P&L grid |
| `QuarterlyPnlTable` | Quarterly-only variant |
| `trailing-returns-table` | 5d/10d/.../sinceInception/MDD/currentDD |
| `StockTable` | Holdings (equity / mutual fund toggle) |
| `FeesTable` | Fee breakdown (Sarla quarterly fees) |
| `header`, `sidebar` | App chrome |
| `admin/ImpersonationBanner` | Visible while admin is impersonating |

### `components/ui/` (52 files, shadcn/ui)

Standard shadcn/Radix primitives — `button`, `dialog`, `dropdown-menu`, `select`, `table`, `tabs`, `popover`, `tooltip`, `sheet`, `toast` (sonner), `command`, `calendar`, etc. If you need a primitive, look here first before adding anything.

### Hooks (`hooks/`)

- `use-mobile.tsx` — breakpoint at 768px
- `useBse500Data.ts` — fetches NIFTY 50 benchmark from `https://qode360-backend.qodeinvest.com/api/v1/returns/indices/`. Handles weekend/holiday inception alignment via `adjustStartDateByOneDay` flag.

### Theme (`tailwind.config.ts`)

```
primary-bg          #EFECD3   (cream)
logo-green          #02422B
button-text         #DABD38   (gold)
card-text           #002017
card-text-secondary #37584F
```

Fonts: Plus Jakarta Sans (sans), Playfair Display (serif), Inria Serif (heading) — wired up in `app/layout.tsx` and exposed as CSS variables.

---

## 17. External integrations

### Zoho CRM (`lib/zoho-sdk.ts`, ~156 lines)

Singleton with auto-refreshing access tokens (refreshes 60s before expiry). Used to sync client KYC fields from Zoho into the dashboard. Required env: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_DC` (we use `in`), `ZOHO_REFRESH_TOKEN`. The `iQode` field in Zoho maps to our `icode`.

### Ghost CMS

Used by the home page to render a blog carousel. Public key in `NEXT_PUBLIC_GHOST_BLOG_KEY`.

### Prisma (`lib/prisma.ts`)

Standard singleton-on-`global` pattern to avoid hot-reload connection storms in dev. Always import as `import { prisma } from "@/lib/prisma"` — never `new PrismaClient()`.

---

## 18. Scripts and source CSVs

### `scripts/` (read-only diagnostics)

Most useful ones:

- `generate-bifurcated-data.js` — regenerate `bifurcated-portfolio-data.ts` from CSVs
- `extract-frozen-scheme-data.js` — extract frozen scheme data from CSV
- `calculate-qye-stats.ts` — compute hardcoded values for Satidham's inactive QYE++
- `check-dinesh-data.ts`, `verify-dinesh-pnl.ts`, `debug-dinesh-pnl.ts` — Dinesh data sanity checks
- `investigate-satidham*.ts`, `investigate-inception-dates.ts` — for debugging Sarla/Satidham
- `check-nav-ranges.ts`, `check-scheme-nav-ranges.ts`, `check-prev-nav-values.ts` — NAV sanity checks

None of these write to the DB.

### `data/` (source of truth for frozen schemes)

CSV exports from production master_sheet, used to generate the hardcoded fixtures. When a scheme closes, drop a CSV here and run the matching script:

- `dinesh_qtf_only_masterhseet.csv`, `dinesh_bifurcated_total_mastersheet.csv` — Dinesh
- `shilpa_old_mastersheet.csv` — Shilpa
- `vikramtrading_old_mastersheet.csv` — Vikram
- `satidham_old_qye_mastersheet.csv`, `satidham_inactive_schemes_data.csv` — Satidham

### `docs/`

- `adding-frozen-scheme-guide.md` — comprehensive how-to for adding a new frozen scheme. **Read this before doing it.**
- `KNOWLEDGE_TRANSFER.md` — this file.

---

## 19. Common tasks (recipes)

### Add a new managed account to the AUM card

1. Insert into `accounts` table.
2. Add the qcode to `MANAGED_ACCOUNTS_LIST` in `app/lib/aum-utils.ts:10-34`.
3. If non-default `system_tag`, add to `different_cases` (line 36).
4. `GET /api/admin/stats` to trigger refresh.

### Add a new Sarla/Satidham scheme

Follow `CLAUDE.md` § "Adding a New Scheme to Sarla/Satidham". The five things to update are: `PORTFOLIO_MAPPING`, `SARLA_SYSTEM_TAGS` / `SATIDHAM_SYSTEM_TAGS`, optionally `SCHEME_QCODE_OVERRIDE`, the scheme arrays in every aggregation method, and (for inactive schemes) the hardcoded data block. **Grep for an existing scheme name** to find every place that needs updating.

### Add a new bifurcated client

See §9. Steps: CSV → script → frozen data const → config in `bifurcated-portfolio-utils.ts` → API route → dashboard branch.

### Block a user

Edit `lib/blocked-icodes.ts`, add the icode to the `Set`, redeploy. Login refusal happens immediately; existing sessions are killed on the user's next request.

### Add an authenticated API route

```ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getEffectiveIcode } from "@/app/lib/admin-utils";

export async function GET() {
  const session = await getServerSession(authOptions);
  const icode = getEffectiveIcode(session);
  if (!icode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ... read-only DB work, never write
}
```

For admin-only: replace the auth block with `const { error, session } = await requireAdmin(); if (error) return error;`.

### Investigate an account's data

```sql
-- 1. Who is this client?
SELECT * FROM clients WHERE icode = 'QUS0010';
-- 2. What accounts can they see?
SELECT * FROM pooled_account_users WHERE icode = 'QUS0010';
-- 3. Account details
SELECT * FROM accounts WHERE qcode = 'QAC00046';
-- 4. Available system tags for the account
SELECT DISTINCT system_tag FROM master_sheet WHERE qcode = 'QAC00046';
-- 5. PMS custodian linkage if any
SELECT * FROM account_custodian_codes WHERE qcode = 'QAC00046';
```

### Verify safety before deploying changes to a utils file

- No `create / update / delete / upsert / $executeRaw` (mutations).
- All Prisma calls are `findMany / findFirst / findUnique / aggregate / count` or `$queryRaw` SELECT only.
- `npm run build` passes (TS errors are tolerated, but warnings worth reading).
- **Existing schemes still work** — manually open the dashboard for at least one Sarla scheme and one Dinesh scheme after touching their utils.

---

## 20. Gotchas & footguns

### Calculation correctness

- **Drawdown is sometimes stored negative** in the DB. Code applies `Math.abs()` everywhere — keep that habit.
- **`"-"` (hyphen) means "no data"** in trailing-returns and monthly P&L. Not zero. Don't `Number("-")` it.
- **NAV-100 baseline** is prepended in *two* places (per-account + aggregated). If you change one, change both.
- **Zerodha-only inception override** at `portfolio-utils.ts:12-17`. PMS and Jainam don't read it.
- **Initial-NAV normalisation is Zerodha-only** (`line 389`). PMS uses raw first NAV.
- **Radiance broker ignores strategy** and always uses `"Total Portfolio Exposure"`. Don't get clever with strategy on Radiance accounts.

### Sarla/Satidham specifics

- **Sarla quarterly P&L is hardcoded up to Q2 2025**, dynamic from Q3 2025+. The cutover is in `calculateQuarterlyPnLWithDailyPL()`. If you edit `AC5_QUARTERLY_PNL` or `AC8_QUARTERLY_PNL` you must also keep `PMS_QAW_Q2_2025_VALUE` in sync.
- **Aggregation arrays drift.** The scheme list is duplicated across `getAmountDeposited / getLatestExposure / getTotalProfit / getCashFlows / calculateMonthlyPnL / calculateQuarterlyPnLWithDailyPL`. They're not in identical order. When adding a scheme, **grep for one of the existing scheme strings and update every match**.
- **Cross-account scheme**: Satidham's "Scheme QAW++ QUS00081" pulls from QAC00066, not QAC00046. Always go through `getEffectiveQcode()`.

### Bifurcated clients

- **`oldFinalNav` is hardcoded in each client config.** If it's wrong, every Total Portfolio number is off by that ratio.
- **Migration dates are hardcoded**: 2026-01-12 (Dinesh), 2026-02-05 (Shilpa), 2026-01-14 (Vikram). If the DB ever backfills earlier data, queries miss it.
- **Daily P&L is 0 for old-scheme rows** — only the aggregated buckets carry real cash. Daily P&L charts will be blank for the old period.
- **`dinesh-utils.ts` (1174 lines) is almost certainly dead code** — it's a Dinesh-only earlier version of `bifurcated-portfolio-utils.ts`. The dashboard uses the bifurcated version. Don't extend `dinesh-utils.ts`; if you confirm it's unused with the team, it can be deleted.

### Operational

- **Plain-text passwords** in `clients.password` and in `ADMIN_PASSWORDS` env var. Don't add new auth flows that assume bcrypt without migrating data.
- **No real CI gating**: `next.config.mjs` ignores both ESLint and TS errors during build. Run `npm run lint` and `tsc --noEmit` manually before merging.
- **Dev port is 3020**, not 3000. The Dockerfile EXPOSEs 3000. There's a port mismatch — be aware in container deployments.
- **Three chart libraries** (Recharts, ApexCharts, Highcharts). Pick the one matching the surrounding code, don't introduce a fourth.
- **`portfolio-utils copy.ts`** exists in `app/lib/`. Looks like a backup. Confirm with the team before deleting, but it should not be referenced.

### CLAUDE.md drift

See §22.

---

## 21. Onboarding checklist

Day 1:
- [ ] Get `.env` from a teammate, `npm install`, `npx prisma generate`, `npm run dev` on port 3020.
- [ ] Read `CLAUDE.md` end to end.
- [ ] Read this doc end to end.
- [ ] Log in as: an admin, the distributor (`live@qodeinvest.com`), and any client. Use admin impersonation to view a regular, a Sarla, and a Dinesh dashboard.

Day 2-3:
- [ ] Read `app/dashboard/page.tsx` top to bottom (it's the dispatcher).
- [ ] Read `app/lib/portfolio-utils.ts` (focus on the three Strategy classes and `calculatePortfolioMetrics`).
- [ ] Skim `app/lib/sarla-utils.ts` — don't try to read all 3677 lines, just understand the constants and the GET entry point.
- [ ] Read `app/lib/bifurcated-portfolio-utils.ts` to understand the engine pattern.
- [ ] Read `prisma/schema.prisma` (skim, but recognise `master_sheet`, `pms_master_sheet`, `accounts`, `clients`, `account_aum`).

Week 1:
- [ ] Pick a low-risk ticket — adding a new account to AUM is a great first task.
- [ ] Run a script from `scripts/` to feel comfortable with the diagnostic tooling.
- [ ] Trace one user request from browser → page.tsx → API route → utils → Prisma → response, in a debugger.

Whenever you touch portfolio code:
- [ ] Verify zero mutations (no `create/update/delete/upsert/$executeRaw` for writes).
- [ ] Test at least: one regular account, one Sarla scheme, one Dinesh scheme.
- [ ] Check trailing returns and Total Portfolio aggregation specifically — they're the most fragile.

---

## 22. Drift in `CLAUDE.md`

`CLAUDE.md` is excellent on conventions but a few specifics have drifted from the code on `prod-new` as of 2026-04-27:

| `CLAUDE.md` says | Reality on this branch |
|---|---|
| Dev server runs on port **2030** | Actually `3020` (`package.json` `dev` script) |
| There are **prop accounts** with `/api/prop` and `/api/prop/default-tags` and a `prop_account_default_tags` table | No `/api/prop` directory exists. The `prop_account_default_tags` table is in the schema but no application code references it. Treat the prop section as historical. |
| Auth has "two credential providers" (client + JWT-for-staff) | One `CredentialsProvider` with three branches inside `authorize()`: admin (env-based), distributor (hardcoded `live@qodeinvest.com`), client (DB). |
| `Stats` and `PmsStats` types in `app/lib/dashboard-types.ts` | Confirmed — types in `dashboard-types.ts` and re-declared in `portfolio-utils.ts:65-105`. |

Worth correcting in a follow-up PR.

---

*End of KT doc. Questions? Update the doc rather than answering them in chat — future you will thank present you.*
