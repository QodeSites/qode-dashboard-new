# Bifurcated Cash In/Out Table — Source from Base/Strategy "Zerodha Total Portfolio" Tags

**Date:** 2026-06-09
**Status:** Approved design, ready for implementation plan
**Scope:** Bifurcated clients only (the `BIFURCATED_CLIENTS` registry, served by `BifurcatedPortfolioEngine`)

## Goal

For bifurcated clients, source the **Cash In/Out table** (and its CSV/Excel/PDF
exports) from the broker's base/strategy "total portfolio" cash tags in
`bifurcated_master_sheet_test`:

- **Total Portfolio page** → the **base** cash tag (`config.depositSystemTag`:
  `Zerodha Total Portfolio` for Zerodha, `Total Portfolio Exposure` for Radiance).
- **Strategy-specific pages** → that scheme's **strategy-specific** cash tag
  (the scheme's `depositTag`, e.g. `QAW++ Zerodha Total Portfolio`,
  `QYE++ Total Portfolio Exposure`).

## Hard constraint

**Do NOT change the "Amount Invested" (amountDeposited) value.** Only the cash
in/out table changes. This requires decoupling the table's data source from the
amount-invested calculation (they currently share `getCashFlows`).

## Why decoupling is necessary

In `bifurcated-portfolio-utils.ts`, `getCashFlows(qcode, scheme)` feeds **both**:
1. The displayed cash table — `handleGET` sets `portfolioData.cashFlows = await getCashFlows(qcode, scheme)` (≈ line 1273).
2. **Amount Invested** — `getAmountDeposited(qcode, "Total Portfolio")` does `cashFlows.reduce((s, f) => s + f.amount, 0)` (≈ line 203).

Changing `getCashFlows` would move Amount Invested. So we introduce a **separate
table-only reader** and leave `getCashFlows` / `getAmountDeposited` untouched.

## Approach (selected)

Add a new method `getCashFlowTableEntries(qcode, scheme)` used **only** to
populate the displayed `portfolioData.cashFlows`. Swap the single call site
(≈ line 1273) to it. Everything else is byte-identical.

Tag selection (derived from config — broker-aware, no hardcoded "Zerodha"):
- `scheme === "Total Portfolio"` → tag = `this.config.depositSystemTag`; read all
  cash flows (no date filter), `capital_in_out` not null and `!= 0`, ordered by date.
- otherwise (a specific scheme) → tag = `this.getSchemeTagsAndDate(scheme).depositTag`,
  filtered `date >= scheme startDate` (preserves the current per-strategy behavior),
  same `capital_in_out` predicate and ordering.
- Read from `this.msTable` (already `bifurcated_master_sheet_test` for these clients).
- Map to `{ date: normalizeDate(date), amount: capital_in_out.toNumber(), dividend: 0 }`.

## Confirmed data facts (read-only probe)

- **Base = exact sum of strategy tags** (Zerodha clients): Dinesh `QAC00053`
  base `Zerodha Total Portfolio` = 149,999,905 = QAW++ 56.8M + QTF++ −6.8M +
  QYE++ 100M; Arwani `QAC00071` and Ashwin `QAC00083` likewise tie out exactly.
- **Radiance clients use the Exposure family.** The 8 clients with zero
  `Zerodha Total Portfolio` rows (Radiance FPI `QAC00065`, GRD `QAC00092`, Karna
  `QAC00097`, Aurus `QAC00098`, Winro `QAC00099`, Transglobal `QAC00103`, Ssuneet
  Kabra `QAC00106`, Binaca `QAC00107`) carry their cash under `Total Portfolio
  Exposure` / `<Strategy> Total Portfolio Exposure`. Deriving the tag from
  `config.depositSystemTag` reads the correct family for them — **no client ends
  up with an empty table.**
- A **`<X> Net Zerodha Total Portfolio`** twin exists with identical sums; we use
  the **non-Net** tag (which is what `depositSystemTag` / `depositTag` already are).

## Net behavioral effect

- **Strategy pages:** effectively unchanged — the strategy cash table already
  reads the scheme's `depositTag` today; the new reader uses the same tag. This
  change formalizes/guarantees it.
- **Total Portfolio page:** the real change — reads the base tag directly instead
  of aggregating member schemes. Because base = sum-of-strategies (verified), the
  displayed entries are equivalent; the value of Amount Invested is unchanged
  regardless (it still uses the old `getCashFlows`).

## Files to change

### `app/lib/bifurcated-portfolio-utils.ts` (only file)
1. **Add** `private async getCashFlowTableEntries(qcode, scheme): Promise<CashFlow[]>`
   implementing the tag-selection above.
2. **Swap** the cash-table call site (≈ line 1273) from
   `await this.getCashFlows(qcode, scheme)` to
   `await this.getCashFlowTableEntries(qcode, scheme)`.
3. **Do not touch** `getCashFlows`, `getAmountDeposited`, `getSchemeTagsAndDate`,
   `msTable`, or any config.

Exports (CSV/Excel/PDF) and the frontend `renderCashFlowsTable` consume
`portfolioData.cashFlows`, so they reflect the new table automatically — no
changes there.

## Out of scope / unaffected

- Non-bifurcated clients: regular managed (`portfolio-utils.ts`), Jainam, PMS,
  Prop, Sarla/Satidham — all unchanged.
- `getCashFlows`, `getAmountDeposited`, Amount Invested — unchanged.
- NAV/returns/drawdown/PnL — unchanged.
- Read-only throughout (SELECT via `msTable.findMany`).

## Verification plan

1. **Build passes:** `npm run build` exits 0.
2. **Read-only:** the new method uses `msTable.findMany` (SELECT) only; no writes.
3. **Amount Invested unchanged:** `getAmountDeposited` and `getCashFlows` are
   byte-identical in the diff (only an added method + one call-site swap).
4. **Tag correctness (read-only probe):** for a Zerodha multi-scheme client
   (Dinesh `QAC00053`): Total Portfolio table entries == base `Zerodha Total
   Portfolio` rows; each strategy table == that `<X> Zerodha Total Portfolio` tag.
   For a Radiance client (e.g. Radiance FPI `QAC00065`): Total Portfolio table ==
   `Total Portfolio Exposure` rows.
5. **Manual (browser):** Dinesh Total Portfolio + each strategy tab show the
   expected cash entries; Amount Invested card unchanged; Excel/PDF export cash
   sheet matches the table.

## Risks & notes

- **Frozen old-scheme clients (Shilpa `QAC00040`, Vikram `QAC00043`):** confirm the
  base `Zerodha Total Portfolio` tag includes the old (QYE+) period's cash flows
  (the probe shows both `QYE+` and `QYE++` strategy tags present, so the base tag
  should encompass both — verify during implementation).
- **Single-strategy clients** (renderMode `single`, e.g. Deepti, GRD): they have no
  "Total Portfolio" scheme; their table goes through the strategy branch
  (`depositTag`), which is correct.
- **Table net vs Amount Invested:** by design these may differ slightly (different
  source); this is the accepted consequence of the hard constraint.
