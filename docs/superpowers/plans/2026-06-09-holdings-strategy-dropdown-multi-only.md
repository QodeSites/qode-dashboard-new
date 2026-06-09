# Holdings Strategy Dropdown (Multi-Only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the holdings strategy filter dropdown only for clients with more than one strategy; keep the Strategy column + exports for single-strategy clients.

**Architecture:** Single-file frontend change. Introduce a named boolean `isMultiStrategy = availableStrategies.length > 1` and use it to gate **only** the dropdown render. The table `showStrategy` props and the three export `hasStrategy` constants stay at `availableStrategies.length > 0`.

**Tech Stack:** Next.js 15 / React 19 / TypeScript (client component).

**Verification note:** This page has no automated test framework. Verification is `npm run build` + grep invariants + a manual browser smoke test. No DB/backend changes — nothing to audit against the read-only DB rules here.

**Spec:** `docs/superpowers/specs/2026-06-09-holdings-strategy-dropdown-multi-only-design.md`

---

## Task 1: Gate the strategy dropdown on `isMultiStrategy`

**Files:**
- Modify: `app/holding-summary/page.tsx` (render-body derived consts ≈ line 2007; dropdown gate ≈ line 2076)

- [ ] **Step 1: Add the `isMultiStrategy` derived boolean**

In the component render body, right after the `stocks`/`mutualFunds` derivation, add the const. Change:
```tsx
    const assetAllocation = getAssetAllocation();
    const { stocks, mutualFunds } = separateHoldings();

    // When a specific strategy is selected, recompute totals from the filtered rows
```
to:
```tsx
    const assetAllocation = getAssetAllocation();
    const { stocks, mutualFunds } = separateHoldings();

    // Dropdown is only useful when there is more than one strategy to filter
    // between. The Strategy column + exports stay at length > 0 (single value is
    // still shown); only the interactive filter is suppressed for single-strategy.
    const isMultiStrategy = availableStrategies.length > 1;

    // When a specific strategy is selected, recompute totals from the filtered rows
```

- [ ] **Step 2: Gate the dropdown on `isMultiStrategy`**

Change the dropdown render gate (≈ line 2076). Change:
```tsx
                {availableStrategies.length > 0 && (
                    <div className="flex justify-end">
                        <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
```
to:
```tsx
                {isMultiStrategy && (
                    <div className="flex justify-end">
                        <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
```

- [ ] **Step 3: Verify the gates are correct (static)**

Run:
```bash
echo "dropdown gate:"; grep -n "isMultiStrategy && (" app/holding-summary/page.tsx
echo "const def:"; grep -n "const isMultiStrategy = availableStrategies.length > 1;" app/holding-summary/page.tsx
echo "column + export gates still > 0 (expect 5):"; grep -cE "showStrategy=\{availableStrategies.length > 0\}|hasStrategy = availableStrategies.length > 0" app/holding-summary/page.tsx
echo "no stray dropdown-on->0:"; grep -c "availableStrategies.length > 0 && (" app/holding-summary/page.tsx
```
Expected:
- `dropdown gate:` one line (the `{isMultiStrategy && (`).
- `const def:` one line.
- column + export gates `= 5` (2 `showStrategy` + 3 `hasStrategy`).
- `no stray dropdown-on->0: 0` (the old `availableStrategies.length > 0 && (` dropdown gate is gone).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exit 0, no type errors. (If it errors on `/api/bifurcated-holdings` "Failed to collect page data", that's a known intermittent build-time DB issue — re-run once.)

- [ ] **Step 5: Commit**

```bash
git add app/holding-summary/page.tsx
git commit -m "feat(holdings): show strategy dropdown only for multi-strategy clients"
```

- [ ] **Step 6: Manual browser smoke test (record results; cannot run headless)**

Start `npm run dev` (port 2030), then:
1. Single-strategy client — login as Sarla (`QUS0007`) or GRD (`QUS00106`): **no** strategy dropdown; the Strategy column is still present in the table and in the Excel/PDF export.
2. Multi-strategy client — login as Ashwin (`QUS00097`): dropdown **present** (`Total Portfolio` + `QAW++` + `QYE++`); selecting a strategy filters the rows and recomputes the totals.

---

## Notes for the implementer

- **YAGNI:** only the dropdown gate changes. Do NOT touch the `showStrategy` props (≈ 2152, 2160) or the `hasStrategy` constants (≈ 940, 1080, 1360) — they intentionally stay `> 0`.
- **No backend/DB changes** — frontend state only.
