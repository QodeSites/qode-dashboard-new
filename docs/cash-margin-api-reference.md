# Cash & Margin — API Reference (for frontend integration)

All endpoints below live under `app/api/internal/cash-margin/*`. This doc
describes what to send and what comes back — not the internal math (see
`docs/cash-margin-client-dashboard-plan.md`,
`docs/page1-client-portfolio-overview-plan.md`,
`docs/page2-cell-by-cell-calculations.md` and
`docs/assumptions-and-changes-from-krish-logic.md` for that).

## Building the Page 2 (Client Detail) screen? Read this first

**`POST /api/internal/cash-margin/page2` (endpoint 10 below) returns
everything Page 2 needs — Account Summary, System Breakup, Margin
Requirements, Debt-to-Equity, and Inputs — in one call**, instead of 5
separate requests to endpoints 3, 4, 5, 6, and 9. Same request body shape as
`margin-requirements` (`qcode` + optional `overrides`/`asOfDate`/`niftyLtp`),
and each nested key in the response is byte-for-byte the same shape as that
table's own standalone endpoint — if you've already built a component
against one of those, point it at `page2Response.<key>` and it works
unchanged. Use the individual endpoints only if you need to lazy-load one
tab independently of the rest of the page. Jump to
[endpoint 10](#10-post-apiinternalcash-marginpage2--all-of-2b2f-in-one-call)
for the full shape.

## Conventions that apply to every endpoint

- **Auth**: every route (except `withdrawal`, which is Krish's, out of scope
  here) calls `requireInternal()` — the caller must have an authenticated
  NextAuth session with `accessType === "internal"`. No session, or a
  non-internal session → `403 { error: "Internal access required" }`. This
  is cookie-based session auth, same as every other page in this app — no
  separate API key/token to attach.
- **Method**: all client-detail + registry/alerts endpoints are `POST`
  (even though most only *read* data) — this is deliberate, so a JSON body
  can carry `overrides`/`asOfDate` without cramming them into a query
  string. `client-list` is the one exception and stays `GET`.
- **Content type**: send `Content-Type: application/json` with a JSON body
  (even an empty `{}` if the route requires no fields — a route that
  requires `qcode` will 400 if the body doesn't parse as JSON).
- **`qcode`**: the account identifier (e.g. `QAC00041`) for every
  single-client endpoint. Get the full list of valid `qcode`/strategy pairs
  from `client-list`.
- **`overrides`** (optional, on most endpoints): a client-side "what-if"
  preview. Pass per-strategy field overrides and the response reflects
  what the numbers *would* look like — **nothing is ever written to the
  database**. Omit it entirely for normal (live DB values) usage. Shape:
  ```jsonc
  {
    "overrides": {
      "QAW++": { "equityPct": 0.72, "cashPctHealthy": 0.06 },
      "QYE++": { "longOptPct": 0.015 }
    }
  }
  ```
  See each endpoint's own section for which override fields it actually
  reads (unused fields are silently ignored, not an error). All percentage
  override fields are **fractions** (`0.72`, not `72`), matching the DB
  columns they shadow.
- **`asOfDate`** (optional, `"YYYY-MM-DD"` string, on every endpoint that
  reads the mastersheet): pins the read to a historical date instead of the
  latest snapshot. **This is a temporary/testing field**, kept in while the
  team back-verifies numbers against frozen spreadsheets — don't build a
  permanent "pick a date" UI control around the expectation that this stays
  forever, but it's safe to use today. Invalid date string → `400 { error: "Invalid asOfDate" }`.
- **Percent fields**: every field whose name ends in `Pct` (or is
  documented as "percent units") is on a **0–100 scale**, not a 0–1
  fraction — e.g. `cashPct: 8.76` means 8.76%, ready to render directly.
  The one place fractions (0–1) appear is inside `overrides` request
  bodies and is called out explicitly there.
- **Money fields**: plain numbers (INR), no currency formatting applied —
  format on the frontend.
- **Null handling**: a numeric field can be `null` when its input is
  genuinely unavailable (e.g. a margin-collateral API fetch failed, or a
  drawdown tag doesn't exist for that account). Always check for `null`
  before formatting/rounding — don't assume `0` and don't crash on
  `toFixed()` against `null`.
- **Errors**: every route returns a JSON error body on failure —
  `{ "error": string, "detail"?: string }` — with an appropriate HTTP
  status (`400` bad input, `403` unauthenticated/wrong role, `404` no
  matching client/mandate, `500` unexpected failure). `detail` (present on
  `500`s) is the raw exception message — fine to log, don't show it
  verbatim to end users.
- **`mastersheetDate`**: nearly every response includes this — the actual
  date (`"YYYY-MM-DD"`) the numbers were computed from (or `null` if no
  mastersheet row exists for that client at all). Always show this next to
  the data so a stale/missing snapshot is visible, not silently blank.

---

## 1. `GET /api/internal/cash-margin/client-list`

The only `GET`, and the only route with no body. Returns every
currently-active `(qcode, strategy)` mandate — use this to populate a
client/strategy picker before calling any of the single-qcode endpoints
below.

**Response** `200`: a plain array —
```jsonc
[
  { "qcode": "QAC00041", "account_name": "Sarla ...", "strategy": "QAW++" },
  { "qcode": "QAC00071", "account_name": "Arwani ...", "strategy": "QYE++" }
  // ...
]
```

---

## 2. `POST /api/internal/cash-margin/client-registry`

**"Clients / Portfolio Overview" (Page 1)** — one row per active,
non-XTS mandate, **across every client at once** (not scoped to one
`qcode` — this is the only multi-client endpoint besides `alerts`).

**Request body**:
```jsonc
{
  "overrides": { "QAW++": { "equityPct": 0.72, "cashPctHealthy": 0.06 } }, // optional
  "asOfDate": "2026-07-15" // optional
}
```
`overrides` fields read here: `equityPct` (Excess Cash's ideal-holdings %)
plus the alert threshold fields (`cashPctHealthy`/`cashPctWarning`/
`cashPctUpside`/`cashCollateralPctHealthy`/`cashCollateralPctWarning`/
`nonCashCollateralPctHealthy`/`nonCashCollateralPctWarning`), since Alert
Status here is rolled up from the same alert table as `/alerts`.

**Response** `200`:
```jsonc
{
  "generatedAt": "2026-07-30T10:00:00.000Z",
  "rows": [
    {
      "qcode": "QAC00041",
      "client": "Sarla Performance Fibers",
      "strategy": "QAW++",
      "tier": "++",                    // "+" | "++"
      "accountValue": 40468858508,
      "cash": 1234567,
      "cashPct": 8.76,                 // (Cash + Liquidcase) / AV * 100 -- NOT cash/AV alone
      "excessCash": 5500000,
      "excessCashPct": 1.36,
      "excessCashStatus": "Excess Cash Levels", // "Excess Cash Levels" | "Low Cash Levels"
      "holdings": 30000000,
      "holdingsPct": 74.1,
      "marginStatus": "Healthy",       // "Shortfall" | "Healthy"
      "currentDrawdownPct": -4.99,     // percent-scale, can be null if no drawdown tag
      "alertStatus": "HEALTHY",        // "HEALTHY" | "WARNING" | "ACTION_REQUIRED" | "UPSIDE" | "UNAVAILABLE" -- worst-of across THIS ROW'S OWN strategy's 3 alert rows only
      "clientAlertStatus": "WARNING",  // same 5 values -- worst-of across EVERY one of this client's active strategies (repeats across all of a client's rows)
      "action": "No action required",  // "Review Margin & Collateral" | "Deploy - Excess Cash" | "No action required"
      "debtEquityHybridRatio": "31-69-0" // "{debt%}-{equity%}-{hybrid%}", each rounded to whole numbers
    }
    // ... one row per active mandate, all clients
  ],
  "summary": {
    "totalClients": 43,
    "totalAum": 123456789000,
    "totalExcessCash": 9876543,
    "marginShortfalls": 2,             // count of rows with marginStatus === "Shortfall"
    "alertsTriggered": 5               // count of DISTINCT clients with worst clientAlertStatus WARNING/ACTION_REQUIRED
  },
  "actionQueue": [
    "Sarla Performance Fibers QAW++ — Deploy - Excess Cash"
    // one line per row whose action isn't "No action required"
  ]
}
```
Two different alert fields, both worth showing: `alertStatus` is this
specific row's own strategy (e.g. a client running QAW++ and QYE++ can show
QAW++ = ACTION_REQUIRED, QYE++ = HEALTHY on their two rows), `clientAlertStatus`
is the same worst-of-everything value repeated on every row for that
client, for an at-a-glance "does this client need attention anywhere" read.
Verified directly against the real `SMA_Dashboard_v12.xlsx` source workbook
(2026-07-30) — see assumptions doc §18 for the full writeup, including why
the source itself doesn't have one clean answer here (the sheet's own
per-client Alert Status formula was only ever finished for one example
client; every other client's cell is a placeholder note, not a working
formula) and why `alertsTriggered` counts distinct clients rather than raw
alert rows (the source's own `N5` formula counts raw non-Healthy rows,
which we deliberately did not copy — noisier and less useful as a banner
KPI).

Note: `action`/`marginStatus`/`excessCashStatus` here are a different,
simpler "healthy vs not" concept than `alertStatus`'s tiered
HEALTHY/WARNING/ACTION_REQUIRED bands — don't conflate the two in the UI.
The ₹50L "Deploy - Excess Cash" trigger is currently a hardcoded flat
threshold (not client/tier-specific) — confirmed against the real source
workbook, which hardcodes the same `5000000` value.

---

## 3. `POST /api/internal/cash-margin/account-summary`

**"Account Summary" (§2b)** for one client — Account Value, Mutual Funds,
Equity Stock, Gold/Low Vol/Momentum, Bond Stock, Liquidcase, Cash, and two
derived totals (Holdings, Cash+Liquidcase), for **Combined** and each
active strategy.

**Request body**:
```jsonc
{ "qcode": "QAC00041", "asOfDate": "2026-07-15" } // asOfDate optional
```
`qcode` is required (`400` if missing). `overrides` is accepted for shape
consistency with the other routes but has no effect here (this table has
no ratio/threshold inputs).

**Response** `200`:
```jsonc
{
  "qcode": "QAC00041",
  "accountName": "Sarla Performance Fibers",
  "strategies": ["QAW++", "QYE++"],
  "mastersheetDate": "2026-07-29",
  "summary": {
    "combined": {
      "accountValue": 40468858508,
      "mutualFunds": 0,
      "equityStock": 27069820.15,
      "gold": 10827928.06,
      "lowVol": 5413964.03,
      "momentum": 10827928.06,
      "bondStock": 0,
      "liquidcase": 8000000,
      "cash": 5400000,
      "holdings": 27069820.15,   // MF + Equity Stock + Bond Stock only -- Gold/LowVol/Momentum NOT included
      "cashPlusLiquidcase": 13400000,
      "rows": [
        { "label": "Account Value", "value": 40468858508, "pct": 100 },
        { "label": "Mutual Funds", "value": 0, "pct": 0 }
        // ... 11 rows total, same fields as the top-level combined object, pre-formatted for a table
      ]
    },
    "byStrategy": {
      "QAW++": { /* same shape as combined, scoped to just that strategy */ },
      "QYE++": { /* ... */ }
    }
  }
}
```
`combined` is **always** present, even for a single-strategy client (it'll
just equal that one strategy's numbers) — safe to render unconditionally.
Gold/Low Vol/Momentum are `0` for non-QAW strategies, not missing.

---

## 4. `POST /api/internal/cash-margin/system-breakup`

**"System Breakup Scheme (Absolute)" (§2d)** — Equity Book + Derivative
Book (Target vs Current vs Difference), for Combined and each active
strategy.

**Request body**:
```jsonc
{
  "qcode": "QAC00041",
  "overrides": { "QAW++": { "equityPct": 0.72, "goldPct": 0.4, "cashPct": 0.1, "lcPct": 0.2 } }, // optional
  "asOfDate": "2026-07-15" // optional
}
```
`overrides` fields read: `equityPct`, `cashPct`, `lcPct`, `derivativePct`,
`goldPct`, `momentumPct`, `lowvolPct`.

**Response** `200`:
```jsonc
{
  "qcode": "QAC00041",
  "accountName": "Sarla Performance Fibers",
  "strategies": ["QAW++"],
  "mastersheetDate": "2026-07-29",
  "systemBreakup": {
    "combined": {
      "accountValue": 40468858508,
      "equityBook": {
        "systemPct": 70,          // % of Account Value this book targets
        "targetTotal": 28328200955,
        "currentTotal": 27069820.15,
        "diffTotal": -1258380.85,
        "rows": [
          {
            "label": "Holdings",   // Combined equity book always collapses to one "Holdings" row
            "subPct": null,
            "systemPct": 70,
            "targetVal": 28328200955,
            "currentVal": 27069820.15,
            "diffVal": -1258380.85,
            "targetPct": 70,
            "currentPct": 66.9,
            "diffPct": -3.1
          }
        ]
      },
      "derivativeBook": {
        "systemPct": 30,
        "targetTotal": 12140657552,
        "currentTotal": 13400000,
        "diffTotal": 1259342448,
        "rows": [
          { "label": "Cash", "subPct": 10, "systemPct": 30, "targetVal": 4046885850.8, "currentVal": 5400000, "diffVal": 1353114149.2, "targetPct": 10, "currentPct": 13.3, "diffPct": 3.3 },
          { "label": "Liquid Case", "subPct": 20, "systemPct": 30, "targetVal": 8093771701.6, "currentVal": 8000000, "diffVal": -85771701.6, "targetPct": 20, "currentPct": 19.8, "diffPct": -0.2 }
        ]
      }
    },
    "byStrategy": {
      "QAW++": {
        "strategy": "QAW++",
        "tier": "++",
        "accountValue": 40468858508,
        "hasEquitySplit": true,   // true => equityBook has 3 rows (Gold/Momentum/Low Vol ETF); false => 1 "Holdings" row
        "equityBook": { /* same shape as above, 3 rows when hasEquitySplit */
          "rows": [
            { "label": "Gold", "subPct": 40, "systemPct": 70, "targetVal": 11331280382, "currentVal": 10827928.06, "diffVal": -503352.36, "targetPct": 28, "currentPct": 41.02, "diffPct": 1.02 },
            { "label": "Momentum", "subPct": 40, "...": "..." },
            { "label": "Low Vol ETF", "subPct": 20, "...": "..." }
          ]
        },
        "derivativeBook": { /* same shape, always 2 rows: Cash, Liquid Case */ }
      }
    }
  }
}
```
Important nuance for `currentPct`/`diffPct`: for the 3-row Equity Book
(`hasEquitySplit: true`), the percentage denominator is the **sum of the
3 current values**, not Account Value — this matches the target sheet's
own math (e.g. "Gold 41.02%"). For the single "Holdings" row and both
Derivative Book rows, the denominator is Account Value. Don't apply one
uniform "divide by Account Value" rule across every row in this table.

`combined.accountValue` is a **sum of the per-strategy Account Values**,
not the same "whole-client" number `account-summary`'s `combined` uses —
the two can legitimately differ by a small amount for the same client on
the same day (see assumptions doc §6). Not a bug in either endpoint.

---

## 5. `POST /api/internal/cash-margin/margin-requirements`

**"Margin Requirements" (§2c)** — Required (Long Options, PSAR, Put
Protection, Drawdown Margin) vs Available (Cash Collateral, Non-Cash
Collateral, Cash) and the resulting Excess/Shortfall, per strategy plus
Combined.

**Request body**:
```jsonc
{
  "qcode": "QAC00041",
  "overrides": { "QAW++": { "longOptPct": 0.015, "psarMultiplier": 2, "psarLeverage": 5, "drawdownMarginPct": 0.05 } }, // optional
  "asOfDate": "2026-07-15", // optional
  "niftyLtp": 24800         // optional -- see below
}
```
`niftyLtp`: a caller-supplied current NIFTY price. Drives the **Put
Protection** line's `contractValue` (`= niftyLtp * niftyLotSize`).
**Without it, Put Protection's cash requirement falls back to 0** — this
isn't an error, just an unfilled input. If the UI has (or will have) a live
NIFTY quote elsewhere on the page, pass it here; otherwise omit it and Put
Protection reads as 0 until a value is supplied. Must be a positive number
if present — `0`/negative/non-numeric → `400 { error: "Invalid niftyLtp" }`.

**Response** `200`:
```jsonc
{
  "qcode": "QAC00041",
  "accountName": "Sarla Performance Fibers",
  "strategies": ["QAW++"],
  "mastersheetDate": "2026-07-29",
  "marginFetchOk": true,   // false if the Zerodha margin-collateral fetch failed -- available.* fields become null in that case
  "combined": {
    "strategy": "Combined",
    "accountValue": 40468858508,
    "lines": [
      { "system": "Long Options", "cashComponent": null, "nonCashComponent": null, "cash": 607032877.6 },
      { "system": "PSAR", "cashComponent": 4046885.85, "nonCashComponent": 4046885.85, "cash": null },
      { "system": "Put Protection", "cashComponent": null, "nonCashComponent": null, "cash": 726781.43 },  // omitted entirely for a strategy with no Put Protection config
      { "system": "Drawdown Margin", "cashComponent": null, "nonCashComponent": null, "cash": 3303486427.7 }
    ],
    "required": { "cc": 4046885.85, "ncc": 4046885.85, "cash": 3911300086.7 },
    "available": { "cc": 12000000, "ncc": 8000000, "cash": 5400000 }, // null,null,null if marginFetchOk is false
    "availablePct": { "cc": 29.65, "ncc": 19.77, "cash": 13.34 },     // each as % of accountValue; null if available.* is null
    "excessShortfall": { "cc": 7953114.15, "ncc": 3953114.15, "cash": -3905900086.7 }, // available - required, per column
    "marginFetchOk": true,
    "putProtectionDebug": {           // TEMPORARY -- only present when this strategy has a Put Protection config
      "momentumVal": 10827928.06,
      "lowVolVal": 5413964.03,
      "protectedVal": 16241892.09,
      "contractValue": 1612000,       // niftyLtp * niftyLotSize, null if niftyLtp wasn't supplied
      "niftyLotSize": 65,
      "niftyLtp": 24800,
      "avgPricePerQty": 450,
      "lotsRequired": 10,
      "putProtectionCash": 292500
    }
  },
  "byStrategy": {
    "QAW++": { /* same shape as combined, scoped to just that strategy */ }
  }
}
```
Notes for the frontend:
- **`lines` is a variable-length array** — "Put Protection" is only present
  for strategies whose resolved config has `gold_pct`/`momentum_pct`/
  `lowvol_pct` all set (i.e. QAW-tier today). Don't assume a fixed 4-line
  array; key off `system` when picking out a specific line, or just render
  whatever's present.
- `putProtectionDebug` is explicitly flagged **temporary** in the code
  (added while investigating a data bug) — useful for a debug/support view,
  but don't build a permanent UI feature around its exact shape; it may be
  removed later.
- Every `MarginTotals`/`MarginAvailableSplit`/`availablePct`/
  `excessShortfall` field can independently be `null` — check each field,
  don't assume the whole object is null/non-null together (e.g.
  `available.cash` can be a live number while `available.ncc` is `null`,
  though in practice `marginFetchOk: false` nulls out all three at once).

---

## 6. `POST /api/internal/cash-margin/debt-equity`

**"Debt To Equity Ratio"** — a 13-row-equivalent breakup (Equity/Debt/
Hybrid Mutual Funds, Liquidcase, Debt/Equity Stock, Cash, derived
Debt/Equity/Hybrid amounts + %) for Combined and each active strategy.

**Request body**:
```jsonc
{ "qcode": "QAC00041", "asOfDate": "2026-07-15" } // asOfDate optional
```
`qcode` required. `overrides` accepted but unused (no ratio/threshold
inputs in this table).

**Response** `200`:
```jsonc
{
  "qcode": "QAC00041",
  "accountName": "Sarla Performance Fibers",
  "strategies": ["QAW++"],
  "mastersheetDate": "2026-07-29",
  "debtEquity": {
    "combined": {
      "strategy": "Combined",
      "equityMf": 0, "debtMf": 0, "hybridMf": 0, "mfTotal": 0,
      "liquidcase": 8000000,
      "debtStock": 0,
      "equityStock": 27069820.15,
      "stockTotal": 27069820.15,
      "cash": 5400000,          // residual: accountValue - mfTotal - stockTotal
      "accountValue": 40468858508,
      "debtAmt": 13400000,      // debtMf + liquidcase + debtStock + cash
      "equityAmt": 27069820.15, // equityMf + equityStock
      "hybridAmt": 0,
      "debtPct": 30.84,         // percent units, of accountValue
      "equityPct": 69.16,
      "hybridPct": 0
    },
    "byStrategy": {
      "QAW++": { /* same shape, keyed by strategy name */ }
    }
  }
}
```
`combined` here is derived by **summing raw inputs first, then
re-deriving** cash/debtAmt/equityAmt/percentages — not a sum of each
strategy's own already-computed `cash`/`debtAmt` (those are residuals and
don't sum correctly on their own). Frontend doesn't need to know this to
consume the response, just don't try to "recompute Combined" client-side
from the `byStrategy` rows — always use the `combined` object as-is.

---

## 7. `POST /api/internal/cash-margin/top-bar`

**Single-client KPI strip**: Account Value, Liquidcase, Holdings,
Cash+Liquidcase, Excess Cash, Alert Status — combined across all of that
client's active strategies.

**Request body**:
```jsonc
{
  "qcode": "QAC00041",
  "overrides": { "QAW++": { "equityPct": 0.72 } }, // optional -- keyed by the client's first active non-XTS strategy
  "asOfDate": "2026-07-15" // optional
}
```

**Response** `200`:
```jsonc
{
  "qcode": "QAC00041",
  "accountName": "Sarla Performance Fibers",
  "strategies": ["QAW++", "QYE++"],
  "tier": "++",              // "+" if every active (non-XTS) strategy is a "+" tier, else "++"
  "mastersheetDate": "2026-07-29",
  "alertStatus": "HEALTHY",  // "HEALTHY" | "ACTION_REQUIRED" | "WARNING" | "CRITICAL" -- see note below, added 2026-07-30
  "kpis": {
    "accountValue": { "value": 40468858508, "pct": 100 },
    "liquidcase": { "value": 8000000, "pct": 19.77 },
    "holdings": { "value": 27069820.15, "pct": 66.9 },
    "cashPlusLiquidcase": { "value": 13400000, "pct": 33.11 },
    "excessCash": { "value": 5500000, "pct": 13.59 }
  }
}
```
**`alertStatus` is a different, once-per-client concept from `alerts`'s
per-strategy HEALTHY/WARNING/ACTION_REQUIRED/UPSIDE/UNAVAILABLE bands** —
don't render them with the same badge logic. This one classifies the
combined `Cash+Liquidcase / Account Value` ratio against its own flat
17%/15%/13% bands (`>=17% HEALTHY`, `>=15% ACTION_REQUIRED`, `>=13%
WARNING`, else `CRITICAL`), ported verbatim from the real reference
workbook. Two things worth knowing before you build a badge/color mapping
for it: the tier **order looks backwards** — `ACTION_REQUIRED` fires at a
*higher* cash % than `WARNING` does, the opposite of how `alerts`'s bands
work — and `CRITICAL` doesn't exist as a value anywhere else in this API.
Both are intentional ports of the source sheet's own (possibly buggy)
logic, not something this endpoint corrected — see
`docs/assumptions-and-changes-from-krish-logic.md` §19.2 if that ordering
ever needs revisiting.

`pct` on every KPI is that value's share of `accountValue` (always
100 for `accountValue` itself). The ideal-holdings ratio used to compute
`excessCash` is resolved from this client's **first active, non-XTS
strategy** only (not a blend across strategies) — override it via
`overrides[<that strategy's name>].equityPct` if you need to preview a
different ratio; you'll need to know which strategy is "first" (alphabetical
by `strategy`) to target the right override key, or just pass the override
for every active strategy name to be safe.

---

## 8. `POST /api/internal/cash-margin/alerts`

**Live Alert Table** — one row per (active, non-XTS mandate) × (metric),
across **every client at once** (like `client-registry`, not scoped to one
`qcode`). Always includes HEALTHY rows too, not just breaches.

**Request body**:
```jsonc
{
  "overrides": { "QAW++": { "cashPctHealthy": 0.06, "cashCollateralPctHealthy": 0.3 } }, // optional
  "asOfDate": "2026-07-15" // optional
}
```
`overrides` fields read: `cashPctHealthy`, `cashPctWarning`,
`cashPctUpside`, `cashCollateralPctHealthy`, `cashCollateralPctWarning`,
`nonCashCollateralPctHealthy`, `nonCashCollateralPctWarning`.

**Response** `200`:
```jsonc
{
  "generatedAt": "2026-07-30T10:00:00.000Z",
  "count": 129,
  "rows": [
    {
      "client": "Sarla Performance Fibers",
      "qcode": "QAC00041",
      "strategy": "QAW++",
      "tier": "++",
      "metricKey": "cash_pct",        // "cash_pct" | "cash_collateral_pct" | "non_cash_collateral_pct"
      "metric": "Cash %",             // human label, ready to display
      "currentValue": 8.76,           // null if the underlying margin fetch failed
      "healthyThreshold": 10,
      "warningThreshold": 5,
      "upsideThreshold": 15,          // null for metrics with no upside band (cash_collateral_pct, non_cash_collateral_pct)
      "delta": -1.24,                 // currentValue - healthyThreshold; null if currentValue is null
      "severity": "ACTION_REQUIRED",  // "HEALTHY" | "WARNING" | "ACTION_REQUIRED" | "UPSIDE" | "UNAVAILABLE"
      "marginFetchOk": true,
      "mastersheetDate": "2026-07-29"
    }
    // ... 3 rows per active non-XTS mandate (one per metric)
  ]
}
```
`severity` precedence: `UNAVAILABLE` (no data) → `UPSIDE` (above the
upside cap, only possible for `cash_pct`) → `HEALTHY` (at/above healthy) →
`WARNING` (below warning) → `ACTION_REQUIRED` (between warning and
healthy). Group by `qcode` client-side if you need a per-client rollup
(that's exactly what `client-registry`'s `alertStatus` already does for
you, worst-of).

---

## 9. `POST /api/internal/cash-margin/inputs`

**"Inputs" panel (§2f)** for one client — the shared per-tier reference
table (same for every client), this client's resolved config per active
strategy + Combined, and an isolated **Put Protection Calculation** block.

**Request body**:
```jsonc
{
  "qcode": "QAC00041",
  "overrides": { "QAW++": { "longOptPct": 0.015 } }, // optional
  "asOfDate": "2026-07-15" // optional
}
```
No `niftyLtp` field here — this endpoint fetches its **own live NIFTY
LTP** from Yahoo Finance server-side (see below), unlike
`margin-requirements`, which requires the caller to supply one.

**Response** `200`:
```jsonc
{
  "qcode": "QAC00041",
  "accountName": "Sarla Performance Fibers",
  "strategies": ["QAW++"],
  "mastersheetDate": "2026-07-29",
  "tierReference": [
    {
      "strategy": "QYE+", "psarMultiplier": 2, "psarLeverage": 5,
      "longOptPct": 1, "drawdownMarginPct": 5, "niftyLotSize": 65,
      "lcPct": 13, "cashPct": 7, "goldPct": null, "momentumPct": null, "lowvolPct": null,
      "equityPct": 80, "derivativePct": 20, "putProtectionPct": 1
    },
    { "strategy": "QYE++", "...": "..." },
    { "strategy": "QAW+", "...": "..." },
    { "strategy": "QAW++", "goldPct": 40, "momentumPct": 40, "lowvolPct": 20, "...": "..." }
    // always these 4 tiers, in this order, regardless of which strategies this client actually runs
  ],
  "byStrategy": {
    "QAW++": {
      "strategy": "QAW++",
      "psarMultiplier": 2, "psarLeverage": 5,
      "longOptPct": 1.5, "drawdownMarginPct": 5
    }
  },
  "combined": {
    "psarMultiplier": null,   // null unless every active strategy resolves to the exact same value
    "psarLeverage": null,
    "longOptPct": 1.2,        // derived: sum(AV * strategy's longOptPct) / combined AV
    "drawdownMarginPct": 8.16
  },
  "putProtectionCalculation": {
    "niftyAtm": 24812.35,     // live-fetched; null if the fetch failed AND no prior value is cached yet
    "fetchedAt": "2026-07-30T09:58:11.000Z", // null if never successfully fetched
    "stale": false,           // true if this is a cached value from a previous successful fetch (today's live fetch failed)
    "fetchOk": true,          // false if THIS call's live fetch failed (regardless of whether a stale value is returned)
    "exposurePerLot": 1612802.75, // niftyAtm * niftyLotSize; null if niftyAtm is null
    "avgPricePerQty": 450,
    "niftyLotSize": 65,
    "protectedVal": 16241892.09,  // Momentum + Low Vol Stock Holdings for the first QAW-split strategy; null if this client has none
    "lotsRequired": 10.07          // protectedVal / exposurePerLot, UNROUNDED (matches the sheet's "10.07x" display, unlike margin-requirements' rounded lots)
  }
}
```
Important: `putProtectionCalculation` here is **completely independent**
of `margin-requirements`'s Put Protection line — it fetches its own live
NIFTY price rather than taking a caller-supplied `niftyLtp`, and
`lotsRequired` is intentionally left unrounded (vs. `margin-requirements`
which rounds to the nearest whole lot). Don't cross-wire the two on the
frontend or expect them to match to the decimal.

Always check `fetchOk`/`stale` before trusting `niftyAtm` for anything
time-sensitive — a `stale: true` value is a fallback from an earlier
successful fetch, shown so the panel doesn't go blank on a transient
network failure, but the frontend should probably flag it visually (e.g.
"as of {fetchedAt}") rather than presenting it as current.

---

## 10. `POST /api/internal/cash-margin/page2` — all of §2b–§2f in one call

Combines **Account Summary (§2b) + System Breakup (§2d) + Margin
Requirements (§2c) + Debt-to-Equity (§2e) + Inputs (§2f)** — endpoints
3-6 and 9 above — into a single response for one client, instead of 5
separate requests when rendering the whole Page 2 client-detail screen.
Purely additive: endpoints 3-6 and 9 still exist and work exactly as
documented above — use this one when you need the whole page at once, use
the individual ones when you only need one table (e.g. a lazy-loaded tab).

**Request body**: identical to `margin-requirements`'s (the union of what
every sub-table accepts):
```jsonc
{
  "qcode": "QAC00041",
  "overrides": { "QAW++": { "equityPct": 0.72, "longOptPct": 0.015 } }, // optional -- same StrategyOverride shape as every other route, applied to every sub-table that reads that field
  "asOfDate": "2026-07-15", // optional
  "niftyLtp": 24800 // optional -- feeds ONLY marginRequirements' Put Protection line (see endpoint 5); inputs' Put Protection Calculation still fetches its own live NIFTY LTP regardless (see endpoint 9)
}
```

**Response** `200`: same top-level shape as every single-qcode endpoint
(`qcode`/`accountName`/`strategies`/`mastersheetDate`), plus one key per
sub-table — each nested value is **exactly** the corresponding field from
that table's own standalone response (endpoints 3-6, 9 above), so if
you've already built a component against one of those, it reads directly
off `page2Response.<key>` with no reshaping:
```jsonc
{
  "qcode": "QAC00041",
  "accountName": "Sarla Performance Fibers",
  "strategies": ["QAW++"],
  "mastersheetDate": "2026-07-29",
  "accountSummary": { "combined": { /* same shape as endpoint 3's summary.combined */ }, "byStrategy": { "QAW++": { /* ... */ } } },
  "systemBreakup": { "combined": { /* same shape as endpoint 4's systemBreakup.combined */ }, "byStrategy": { "QAW++": { /* ... */ } } },
  "marginRequirements": { "marginFetchOk": true, "combined": { /* same shape as endpoint 5's combined */ }, "byStrategy": { "QAW++": { /* ... */ } } },
  "debtEquity": { "combined": { /* same shape as endpoint 6's debtEquity.combined */ }, "byStrategy": { "QAW++": { /* ... */ } } },
  "inputs": { "tierReference": [ /* ... */ ], "byStrategy": { /* ... */ }, "combined": { /* ... */ }, "putProtectionCalculation": { /* same shape as endpoint 9's putProtectionCalculation */ } }
}
```
Note `marginRequirements` and `inputs` are nested one level deeper here than
their standalone responses (`marginFetchOk`/`combined`/`byStrategy` live
under `marginRequirements`, not at the response root) — everything else
about their contents is identical to endpoints 5 and 9.

404/500 behavior is the same as every other single-qcode endpoint (404 if
the qcode has no active mandate; the whole request fails together, there's
no partial-success shape — if one sub-table's computation throws, the
entire response is a 500, not a mix of good and null sections).

---