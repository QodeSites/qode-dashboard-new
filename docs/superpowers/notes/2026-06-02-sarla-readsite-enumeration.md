# Sarla/Satidham `master_sheet` read-site enumeration + Total Portfolio sourcing

Task 1 of the bifurcation generalization plan. Investigation only — no code changed.

File under analysis: `app/lib/sarla-utils.ts`
Goal: enumerate every `master_sheet` read site, and resolve whether "Total Portfolio"
gets its displayed NAV/exposure by AGGREGATING member schemes or by reading a DEDICATED
`system_tag`. This decides whether the upcoming bifurcation config needs a "Total Portfolio"
entry.

Schemes being switched to `bifurcated_master_sheet_test`:
- Sarla "Scheme B" — qcode `QAC00041`, tag `"Total Portfolio Value"` (but most read sites
  pass the INLINE literal `"Zerodha Total Portfolio"`, NOT the mapped tag — see Step 1).
- Satidham "Scheme QAW++" — qcode resolves to `QAC00066` via `getEffectiveQcode`,
  tag `"Zerodha Total Portfolio"` (from `SATIDHAM_SYSTEM_TAGS`).

---

## Step 1 — The 19 `master_sheet` read sites

Line 388 is `pms_master_sheet` — OUT OF SCOPE, excluded.

`schemeVar` = the variable holding the scheme name at that site (`scheme` = function arg,
`s` = loop iteration var inside a Total-Portfolio aggregation loop).

`tagExpr` = exact expression supplied to `system_tag` in the `where` clause.

| # | line | enclosing function | schemeVar | tagExpr |
|---|------|--------------------|-----------|---------|
| 1 | 298  | `getSingleSchemeProfit` | `scheme` | `systemTag` = `getSystemTag(scheme, effectiveQcode)` |
| 2 | 1892 | `getAmountDeposited` (Total Portfolio loop) | `s` | `systemTag` = `s==="Scheme B" ? "Zerodha Total Portfolio" : getSystemTag(s, qcode)` |
| 3 | 1905 | `getAmountDeposited` (Total Portfolio loop, `s==="Scheme QAW++"`) | `s` | `systemTag` = `getSystemTag(s, effectiveQcode)` |
| 4 | 1930 | `getAmountDeposited` (`scheme==="Scheme B"`) | `scheme` | literal `"Zerodha Total Portfolio"` (via `systemTag` local) |
| 5 | 1945 | `getAmountDeposited` (`scheme==="Scheme QAW++"`) | `scheme` | `systemTag` = `getSystemTag(scheme, effectiveQcode)` |
| 6 | 1994 | `getLatestExposure` (Total Portfolio loop) | `s` | `systemTag` = `s==="Scheme B" ? "Zerodha Total Portfolio" : getSystemTag(s, qcode)` |
| 7 | 2011 | `getLatestExposure` (Total Portfolio loop, `s==="Scheme QAW++"`) | `s` | `systemTag` = `getSystemTag(s, effectiveQcode)` |
| 8 | 2048 | `getLatestExposure` (`scheme==="Scheme B"`) | `scheme` | literal `"Zerodha Total Portfolio"` (via `systemTag` local) |
| 9 | 2070 | `getLatestExposure` (fall-through, incl. `Scheme QAW++` & **Total Portfolio dedicated tag is NOT hit here**) | `scheme` | `systemTag` = `getSystemTag(scheme, effectiveQcode)` |
| 10 | 2179 | `getPortfolioReturns` (first NAV record) | `scheme` | `systemTag` = `getSystemTag(scheme, effectiveQcode)` |
| 11 | 2185 | `getPortfolioReturns` (latest NAV record) | `scheme` | `systemTag` = `getSystemTag(scheme, effectiveQcode)` |
| 12 | 2225 | `getTotalProfit` (non-Total-Portfolio branch) | `scheme` | `systemTag` = `getSystemTag(scheme, effectiveQcode)` |
| 13 | 2289 | `getHistoricalData` (fall-through — **Total Portfolio reaches here**) | `scheme` | `systemTag` = `getSystemTag(scheme, effectiveQcode)` |
| 14 | 2350 | `getCashFlows` (Satidham Total Portfolio loop, `s==="Scheme QAW++"`) | `s` | `systemTag` = `getSystemTag(s, effectiveQcode)` |
| 15 | 2379 | `getCashFlows` (Sarla Total Portfolio loop, `s==="Scheme B"`) | `s` | `systemTag` = `s==="Scheme B" ? "Zerodha Total Portfolio" : getSystemTag(s)` (resolves to literal `"Zerodha Total Portfolio"`) |
| 16 | 2409 | `getCashFlows` (fall-through, per-scheme) | `scheme` | `systemTag` = `scheme==="Scheme B" ? "Zerodha Total Portfolio" : getSystemTag(scheme, effectiveQcode)` |
| 17 | 3200 | `calculateQuarterlyPnLWithDailyPL` (default per-scheme) | `scheme` | `systemTag` = `getSystemTag(scheme, effectiveQcode)` |
| 18 | 3384 | `GET` handler (`cashInOutData` query) | `scheme` | `systemTag` = `getSystemTag(scheme, effectiveQcode)` — **DEAD READ** (see note) |
| 19 | 3389 | `GET` handler (`masterSheetData` query) | `scheme` | `systemTag` = `getSystemTag(scheme, effectiveQcode)` — **DEAD READ** (see note) |

### Sites with NO `system_tag` in the where clause
None. Every one of the 19 sites filters on `system_tag`.

### DEAD-READ note (sites 18 & 19, lines 3384 / 3389)
In the `GET` handler, `cashInOutData` and `masterSheetData` are declared (3364/3365),
assigned via the `Promise.all` at 3383–3394, and then **never read again** anywhere in the
file (grep confirms only the 3 declaration/assignment hits). The displayed
`portfolioData.equityCurve`, `cashFlows`, exposure, etc. are all built from the dedicated
helper calls (`getHistoricalData`, `getCashFlows`, `getLatestExposure`, …) at 3401–3420 —
NOT from `masterSheetData`. So sites 18/19 are inert; rewriting them has no display effect,
but they should still be moved to the bifurcated source for consistency (Task 3) since they
share the exact same `(effectiveQcode, getSystemTag)` resolution as the live helpers.

### Per-scheme tag resolution for the two switched schemes
- **Sarla "Scheme B" (`QAC00041`)**: Almost every live site uses the INLINE literal
  `"Zerodha Total Portfolio"` (sites 4, 8, 15, 16; loop sites 2 and 6 also force it for
  `s==="Scheme B"`). The mapped `SARLA_SYSTEM_TAGS["Scheme B"] = "Total Portfolio Value"`
  is what `getSystemTag` WOULD return, and it IS used at the generic fall-through sites that
  Scheme B reaches: 1 (`getSingleSchemeProfit`), 10/11 (returns), 12 (profit), 13
  (`getHistoricalData` — the displayed curve), 17 (quarterly), 18/19 (dead).
  **=> Scheme B's bifurcation rewrite must cover BOTH tags: the inline `"Zerodha Total
  Portfolio"` AND the mapped `"Total Portfolio Value"`.** Flag this prominently for Task 3.
- **Satidham "Scheme QAW++" (resolves to `QAC00066`)**: Always uses
  `getSystemTag` → `"Zerodha Total Portfolio"` (sites 3, 5, 7, 9, 14, and generic
  fall-throughs 1/10/11/12/13/17/18/19). No inline literal divergence.

---

## Step 2 — Total Portfolio NAV / exposure / historical sourcing

Three independent paths feed the "Total Portfolio" pseudo-scheme. They DISAGREE:

### (A) `getLatestExposure` "Total Portfolio" branch — AGGREGATES members
Lines 1969–2038. `if (scheme === "Total Portfolio")` iterates a `schemes` list:
- Sarla (`QAC00041`): `["Scheme B", "Scheme PMS QAW"]` (1974)
- Satidham (`QAC00046`): `["Scheme A","Scheme B","Scheme PMS QAW","Scheme QAW++","Scheme QYE++"]` (1973)

For each member it sums `portfolio_value` and `nav` from per-scheme `master_sheet`
records (1994 / 2011) plus PMS data (2027). It NEVER reads a dedicated "Total Portfolio"
tag. => exposure/portfolioValue AGGREGATES members for BOTH accounts.

### (B) `getHistoricalData` — reads the DEDICATED tag (NO aggregation)
Lines 2256–2308. There is NO `if (scheme === "Total Portfolio")` branch in this function
(grep of "Total Portfolio" in file shows 1875, 1969, 2326, 2727, 2999 — none in
2256–2309). So when `scheme === "Total Portfolio"` it falls straight through to line 2289
and queries a single `(effectiveQcode, getSystemTag("Total Portfolio", qcode))` series:
- Sarla → `SARLA_SYSTEM_TAGS["Total Portfolio"]` = `"Sarla Performance fibers Scheme Total Portfolio"` (line 328)
- Satidham → `SATIDHAM_SYSTEM_TAGS["Total Portfolio"]` = `"Total Portfolio Value A"` (line 339)

The GET handler builds the **displayed `equityCurve`** (3430–3441), `drawdownCurve`,
`drawdownMetrics`, `inceptionDate` and the quarterly NAV input directly from this
`getHistoricalData` result. => the displayed Total Portfolio NAV curve comes from a
DEDICATED master_sheet tag, NOT from aggregation.

### (C) Deposits / cashflows / profit — AGGREGATE members
- `getAmountDeposited` Total Portfolio branch (1875–1921): loops members, sums `capital_in_out`.
- `getCashFlows` Total Portfolio branch (2326–2403): loops members, concatenates flows.
- `getTotalProfit` Total Portfolio branch (2232+): loops `sarlaSchemes` / satidham members,
  sums `getSingleSchemeProfit`.

=> deposits, cashflows, and total profit all AGGREGATE members for BOTH accounts.

### Summary of the Total-Portfolio split
| Metric | Source | Sarla tag/members | Satidham tag/members |
|--------|--------|-------------------|----------------------|
| equityCurve / NAV / drawdown (DISPLAYED) | **DEDICATED tag** (B) | `"Sarla Performance fibers Scheme Total Portfolio"` | `"Total Portfolio Value A"` |
| currentExposure / portfolioValue | AGGREGATE members (A) | Scheme B + PMS QAW | Scheme A/B/PMS QAW/QAW++/QYE++ |
| amountDeposited / cashFlows | AGGREGATE members (C) | Scheme B + PMS QAW | members |
| totalProfit | AGGREGATE members (C) | sarlaSchemes | members |

So Total Portfolio is ALREADY a mixed/inconsistent aggregate in the existing code:
the displayed curve is a dedicated tag while the headline numbers aggregate members.

---

## Step 3 — DECISION: does the config need a "Total Portfolio" entry?

**NO.** Do not add a "Total Portfolio" entry to the bifurcation config.

Reasoning, against the spec's tie-breaker ("only recommend a Total Portfolio entry if the
displayed aggregate NAV would otherwise stay on master_sheet while the aggregate's deposits
move to bifurcated — a mixed/inconsistent aggregate"):

1. The bifurcation switch is scoped to the two NAMED member schemes: Sarla **Scheme B** and
   Satidham **Scheme QAW++**. Those schemes' own read sites move to `bifurcated_master_sheet_test`.

2. Total Portfolio's deposits/exposure/cashflows/profit AGGREGATE their members. Because they
   call the SAME per-scheme code paths (the loop branches at sites 2/3, 6/7, 14/15, and
   `getSingleSchemeProfit` site 1), they will AUTOMATICALLY follow Scheme B / QAW++ onto the
   bifurcated source once those schemes' sites are rewritten in Task 3. No separate entry needed.

3. The displayed Total Portfolio equity curve (path B) reads a SEPARATE dedicated tag
   (`"Sarla Performance fibers Scheme Total Portfolio"` / `"Total Portfolio Value A"`), which is
   a DIFFERENT system_tag than the member schemes being bifurcated. It is its own
   pre-aggregated series in `master_sheet`, independent of Scheme B / QAW++. The spec's
   tie-breaker targets the case where the displayed aggregate NAV would diverge from
   bifurcated deposits. Here the displayed curve is NOT computed from Scheme B / QAW++ NAVs
   at all — it is a standalone tag — so moving Scheme B / QAW++ to bifurcated does NOT make
   THIS curve internally inconsistent with itself; the curve never depended on them.

   The pre-existing mismatch between "dedicated-tag curve" and "aggregated headline numbers"
   exists TODAY on `master_sheet` and is out of scope for a bifurcation switch that is
   explicitly scoped to two member schemes. Bifurcating Scheme B / QAW++ does not worsen it:
   the headline numbers move together (members → bifurcated), and the dedicated curve stays
   put. Whether the dedicated "Total Portfolio" tag ALSO exists in `bifurcated_master_sheet_test`
   is a separate data-ops question, not required for this scoped switch.

**Conclusion:** Config covers only the two member schemes. No `{ "Total Portfolio": {...} }`
entry. If the team later wants the displayed Total-Portfolio CURVE on bifurcated too, that is
a deliberate, separate change requiring confirmation that the dedicated tags
(`"Sarla Performance fibers Scheme Total Portfolio"`, `"Total Portfolio Value A"`) exist in
`bifurcated_master_sheet_test` — out of scope here.

### Flag for Task 3 (config authors)
Sarla **Scheme B** uses TWO distinct system_tags across its read sites:
- inline literal `"Zerodha Total Portfolio"` (live sites 4, 8, 15, 16; loop forcing at 2, 6)
- mapped `"Total Portfolio Value"` (generic sites 1, 10, 11, 12, 13-displayed-curve, 17, 18/19)

The Scheme B bifurcation rewrite/config MUST account for BOTH tags, or the displayed Scheme B
curve (site 13, tag `"Total Portfolio Value"`) and the deposit/exposure numbers (inline
`"Zerodha Total Portfolio"`) will split across two data sources. Satidham Scheme QAW++ has no
such divergence (always `"Zerodha Total Portfolio"`).
