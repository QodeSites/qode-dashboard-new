# Account Strategy Status (closed accounts) - Plan

Status: planned, not built. Owner: Akash.

## Problem

Closed accounts still show stale data. Ashwin Agarwal (QAC00083) is closed, but the Holdings Summary shows
real positions (equity data to 2026-09-11, MF data to 2026-08-27) while his NAV feed is current. The app has
no way to know an account or strategy is closed.

## Goal

A plug-and-play "is this account's strategy closed?" lookup. The table only records the fact. Each place in
the code decides what "closed" means there (hide holdings, exclude from totals, show Amount Invested as 0).
Adding a new place later is a helper call plus a condition, with no schema change.

## Design

### Table (created by the user, not by Claude)

`account_strategy_status`

| column | notes |
|---|---|
| `qcode` | account, e.g. QAC00083 |
| `strategy` | QYE+, QYE++, QAW++, ... exact format to be confirmed against `accounts.strategy` and the per-row `strategy` on holdings |
| `closed_date` | date the strategy was closed |
| `notes` | optional reason |

Unique on (`qcode`, `strategy`). A row exists only when closed. No row means active.

### Behaviour rule (binary)

- In the table: skip that thing completely.
- Not in the table: behave exactly as today. No partial or new behaviour for anyone else.
- Lookup error: treated as "not in the table" (fail open), so a DB problem never hides a portfolio.

### Helper (new): `app/lib/account-status.ts`

- `getClosedStatus(qcode, strategy?)` returns the closed date or `null`.
- Read-only `findMany` only. In-memory cache, about 60 seconds.
- On any error, return `null`.

## Phases

### Phase 1 - helper and holdings gate

1. Add the helper.
2. `app/api/bifurcated-holdings/route.ts`: after `auth.qcode`, check the helper. If closed, skip the holdings
   queries and return empty holdings plus `closed: { closedDate }`.
3. `app/lib/sarla-utils.ts` `PortfolioApi.getHoldings` (about line 3747): same check, covering Sarla, Satidham
   and the QAC00066 override.
4. `app/holding-summary/page.tsx`: add `closedInfo` state, set it in all three fetchers (bifurcated,
   Sarla/Satidham, general). Render an "Account closed on <date>" card in place of the summary cards, chart,
   tables and PDF/Excel buttons. The card is a new scoped component, not an edit to `components/ui/*`.

### Phase 2 - separate, after Phase 1 is verified

- Excel exports: `app/lib/holdings-export-utils.ts`, and skip closed accounts in the admin bulk download.
- NAV and returns: `getUserQcodes` / `calculatePortfolioMetrics` in `app/lib/portfolio-utils.ts`.
- AUM and Zoho: `app/lib/aum-utils.ts`, `app/lib/zoho-aum-snapshot.ts`.
- Amount Invested: move truly-closed entries from `app/config/zero-amount-invested-accounts.json` onto the
  table, one at a time. The JSON is not purely "closed", so it stays until each entry is checked.
- Internal portfolio review (`app/lib/internal-utils.ts`): decide separately, since historical returns may
  need to keep closed accounts.

## Known gaps in the current code (from analysis)

- `holding-summary/page.tsx` has no account dropdown and always uses `accounts[0]`. A closed account listed
  first would hide the client's open ones.
- The PMS and Sarla paths render a completely blank page when nothing is returned.
- Filtering only inside `getHoldings` would leave a closed account counted in NAV, returns and AUM.

## Rules for whoever builds this

- Application code is read-only against the DB. Only `SELECT` style calls.
- Never run any Prisma CLI command (`db pull`, `generate`, `db push`, `db execute`, `migrate`, `studio`).
  Those are the user's job, and require an explicit instruction plus double confirmation.
- Do not run `npm run build` to verify. It breaks `npm run dev`. Verify on the dev server (port 3020).
- Do not edit shared `components/ui/*` for one-off styling.
- Reuse the current branch (`fix/rajat-raised-bugs`) unless a new one is named.

## User prerequisites

1. Create `account_strategy_status`.
2. Insert Ashwin's row.
3. Run `prisma db pull` and `prisma generate`.
4. Confirm the strategy value format.

## Verification (Phase 1)

- With Ashwin's row present: his Holdings Summary shows the closed card.
- Dinesh and any account not in the table: unchanged.
- Fail-open: temporarily make the helper query fail and confirm holdings still show as today.
- Confirm the closed-strategy filtering behaviour for accounts with more than one strategy (see below).

## Open decisions

- Multi-strategy accounts: show the closed card only when every strategy is closed, or filter out just the
  closed strategy's rows? Suggested: filter the closed strategy's rows, and show the card only when nothing
  is left.
- Strategy value format: `QYE++` versus `Scheme QYE++`.
- Phase 2 scope: holdings only, or also NAV, AUM and exports.
