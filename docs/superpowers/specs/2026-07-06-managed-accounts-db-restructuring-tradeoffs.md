# Managed Accounts DB Restructuring — Design Decisions, Trade-offs & Reasoning

**Date:** 2026-07-06
**Status:** Companion to `docs/superpowers/plans/2026-07-06-managed-accounts-db-restructuring.md`
**Purpose:** Record *why* each decision in the plan was made, what alternatives were
considered, and what we knowingly give up. If a decision later proves wrong, this
doc tells you what the second-best option was.

---

## D1. Migrate into the bifurcated framework vs build a third framework vs stay legacy

### Options

| Option | Description |
|---|---|
| **A (chosen)** | Migrate remaining managed accounts into the existing bifurcated framework (`BifurcatedPortfolioEngine` + bifurcated tables) |
| B | Design a brand-new "v3" framework with a fully normalized schema and migrate *everything* (legacy + bifurcated) onto it |
| C | Keep legacy strategies; just fix indexes/constraints in place on `master_sheet` |

### Reasoning

**Why A:** The bifurcated framework is already the de-facto standard — 33 clients,
battle-tested engine, working API routes, dashboard routing, holdings, Excel export,
validation scripts, and an onboarding runbook. Every new client for the past several
months has been onboarded onto it. The organization has *already voted* with its
migration pattern; the plan just finishes the job and fixes the debts that
accumulated along the way (test-table-in-prod, hardcoded config).

**Why not B:** A v3 rewrite would put ~65+ client dashboards (33 bifurcated + legacy)
through a risky double migration for mostly aesthetic gain. The bifurcated engine's
math (NAV curves, CAGR/absolute switch, monthly PnL anchoring) encodes months of
client-verified edge-case fixes (see the frozen-scheme carve-outs, inception
anchoring, base-tag = sum-of-strategies tie-outs in the 2026-06-09 spec). Rewriting
it means re-earning that correctness. The cost/benefit is bad while the current
engine has no known correctness problems — only structural/operational ones.

**Why not C:** C leaves three engines alive forever, leaves onboarding as a
code-deploy, and leaves the tag conventions triple-implemented. It fixes the cheap
problems and skips the expensive ones — the expensive ones are the actual pain.

**What we give up:** The bifurcated data model is still tag-based (see D5), so we
inherit its stringly-typed nature. Accepted deliberately.

---

## D2. Live twin table (`bifurcated_master_sheet`) vs rename `_test` vs keep serving `_test`

### Options

| Option | Description | Client-visible risk during transition |
|---|---|---|
| **A (chosen)** | `CREATE TABLE bifurcated_master_sheet (LIKE ..._test)`, backfill, engine switches by env | None — old path keeps working until the code flips |
| B | Rename `bifurcated_master_sheet_test` → `bifurcated_master_sheet`, create a fresh empty `_test` | Rename is instant but every deployed reader breaks until the code deploy lands; requires coordinated downtime |
| C | Accept `_test` as the real name; document it | Zero migration work |

### Reasoning

**Why A:** It is the only option with *no coordination window*. Creating the twin is
additive; production continues reading `_test` until Phase 2 code ships, and rollback
is "don't flip the getter." It also exactly mirrors the `master_sheet` /
`master_sheet_test` convention that CLAUDE.md documents and the data team already
operates — one mental model, one sync mechanism to clone rather than invent.

**Why not B:** The rename must be atomic with a code deploy across the dashboard app
*and* any other reader (data-team scripts, `aum-utils` raw SQL, distributor utils).
On Postgres the rename itself is cheap, but the blast radius of a missed reader is a
client-facing outage. Not worth it to avoid one backfill.

**Why not C:** C perpetuates the real hazard: the *staging* table — which the data
team edits freely per the documented test→live workflow — is what clients see. Every
staging experiment is a potential client incident. Fixing this is arguably the single
highest-value item in the whole plan; C forfeits it.

**Cost accepted:** Dual storage (~2× rows for the bifurcated data) and a sync job to
maintain. Storage is trivial at this scale (daily rows × tags × ~40 accounts); the
sync job clones a mechanism that already exists for `master_sheet`.

---

## D3. DB-driven client config vs TS registry (status quo) vs hybrid

### Options

| Option | Onboarding | Type safety / review | Rollback | Drift risk |
|---|---|---|---|---|
| TS registry (status quo) | Code deploy per client | Full (TS compiler, PR review, git history) | Git revert + deploy | Comments already stale (registry header contradicts contents) |
| **DB config (chosen)** | Two `INSERT`s by data team | Runtime validation only | `is_enabled = false`, instant | Single source of truth |
| Hybrid (DB overrides TS) | Mixed | Mixed | Confusing | Two sources of truth — worst drift |

### Reasoning

**Why DB config:** The registry is growing ~5 clients/month. Each onboarding today
costs: a TS file, a registry edit, a build, a release, and a deploy slot — for what
is semantically *data entry* (name, qcode, 2–4 tag strings, a date). The
investigation script already generates the config mechanically; a human paste-and-
deploy adds latency and copy-paste risk, not judgment. Moving it to rows also gives
the data team end-to-end ownership of onboarding, matching how they already own the
sheet data itself.

**Why not keep TS:** Beyond deploy friction, the code-as-config pattern has already
produced drift (the "Shilpa and Vikram are NOT in this registry" comment sits directly
above their entries). Type safety is a weak argument here because the values are
strings/dates the compiler can't validate anyway — the *real* validation is
`validate-bifurcated-registry.ts` checking against the DB, which works identically on
rows.

**Why not hybrid:** Two live sources of truth is strictly worse than either. The plan
does use the TS array as a **fallback** (loader failure → static array), but that is
a degraded-mode safety net during transition, explicitly deleted in Phase 4 — not a
permanent second source.

**What we give up, and mitigations:**
- *Git history of config changes* → mitigated by `created_at`/`updated_at` columns;
  if audit matters more later, add a config-audit trigger table (the DB already has
  `pms_clients_audit_log` as a precedent).
- *PR review of onboarding* → replaced by the validation script as the gate
  (extended in Phase 3 to validate DB rows). This is the same rigor, moved from
  review-time to insert-time.
- *Verbose one-off configs* (Dinesh's frozen QTF scheme with hand-built
  `FrozenSchemeData`) genuinely don't fit rows. Decision: those few stay as TS files
  loaded by name until Phase 5; the schema is not distorted to accommodate its rarest
  case. Rule of thumb applied: **model the dominant pattern in data, keep the
  exceptions in code.**

---

## D4. Unique constraint `(qcode, date, system_tag)` + dedupe vs application-level dedupe

### Reasoning

**Why the constraint:** Every aggregate the engine computes (`_sum.pnl`,
`_sum.capital_in_out`, latest-row lookups) silently doubles if a duplicate row lands.
This is the worst failure class in a financial dashboard: no error, plausible-looking
wrong numbers shown to a client. A constraint converts "silent wrong money" into
"loud failed insert at the data pipeline," which is exactly where the failure should
surface — at write time, owned by the writer.

**Why not app-level dedupe:** The dashboard is one of several readers (data-team
scripts, distributor utils, aum raw SQL). Deduping in the app fixes one reader and
adds `DISTINCT ON` complexity to every query; the others stay wrong. Integrity
belongs in the schema.

**Trade-off accepted:** The data team's loader must become idempotent
(upsert/delete-then-insert per sync batch) or inserts will fail. That is a feature —
it forces the pipeline to define its idempotency story — but it is real work for
them, and it is why the constraint lands in Phase 1 with the dedupe audit *before*
it, not as a surprise.

**Index choice `(qcode, system_tag, date)`:** every engine query filters
`qcode + system_tag` and sorts/ranges on `date`; the existing `(qcode, date)` index
forces a filter over all tags of a date range. Column order follows
equality-equality-range. The old index stays (other readers may use it); index bloat
at this table size is negligible.

---

## D5. Keep the tag-based (`system_tag`) data model vs normalize into scheme/series tables

### Options

| Option | Description |
|---|---|
| **A (chosen)** | Keep the wide tag-based row shape (`qcode, date, system_tag, nav, pnl, ...`); add integrity + config tables around it |
| B | Fully normalize: `schemes` table, `series` table (`scheme_id, date, metric, value`), FKs everywhere |
| C | Semi-normalize: replace `system_tag` varchar with FK to a `system_tags` dictionary table |

### Reasoning

**Why A:** The tag-based shape is the *interchange format with the data team's
pipeline* — their Excel-derived tooling produces exactly these rows, for both
`master_sheet` and the bifurcated table. Changing the row shape means rewriting their
ingestion, every investigation script, the sync job, and the engine's every query
simultaneously — a flag-day across two teams. Meanwhile the actual observed failure
modes (dupes, missing tags, wrong tag strings, prod-reads-test) are all fixable
*around* the shape: constraints (D4), config tables that make tag strings
data-driven instead of code-hardcoded (D3), and validation scripts. The config
tables effectively give us the normalization benefit where it matters — tag strings
now live in exactly one queryable place per client — without touching the fact rows.

**Why not B:** Highest engineering purity, highest cost, and it moves the
Decimal-heavy math from "one row per date per tag" (which Prisma aggregates handle
well) to EAV-style pivoting. The dashboard is read-only over data produced elsewhere;
optimizing the schema for a writer we don't own is upside-down.

**Why not C:** A tag dictionary FK prevents *misspelled* tags but not *semantically
wrong* tags (the real bug class: pointing a scheme at its `Net` twin, or exposure vs
profit swapped). `dashboard_scheme_config` catches that class better because the
validation script can assert "this exposure_tag has rows for this qcode and ties out
against the base tag." C's benefit is mostly subsumed; its migration cost
(rewriting every insert) is not. Revisit C only if tag-typo incidents actually occur.

---

## D6. Single engine, config-driven vs keeping per-broker strategy classes

### Reasoning

**Why single engine:** The three legacy strategies differ *only* in which tags they
read and one deposit semantic (Jainam, see D9). The math is copy-pasted — the CAGR
switch, `getNavAtDate` closest-neighbor logic, and drawdown accumulation appear
near-identically 3–5×  across `portfolio-utils.ts`, `bifurcated-portfolio-utils.ts`,
`sarla-utils.ts`, `dinesh-utils.ts`. Copy-paste math in a financial product means a
bug fixed in one place stays alive in four others (this has already happened: the
NAV-prepend-100 rule exists in two subtly different forms). Tags are *data*; the
Strategy pattern was being used to encode data in class hierarchy.

**Why not keep strategies:** The pattern earns its keep when *behavior* differs.
Post-migration the only behavioral divergence is PMS (different table, different
join via custodian codes) — which is why `PmsStrategy` survives and managed-account
strategies don't.

**Trade-off accepted:** The engine grows config branches (e.g. `deposit_mode`),
risking a god-class over time. Guardrail: every new config flag must be data-shaped
(a column), not a client-name check; if a client needs genuinely different *math*,
that's a signal to split, not to add a flag.

---

## D7. Env-based table selection (`NODE_ENV`) vs per-client flag vs connection-level routing

### Reasoning

**Why env-based:** It is the established convention in this codebase
(`master_sheet` vs `master_sheet_test`, `equity_holding` vs `_test`, documented in
CLAUDE.md). Consistency here is worth more than any marginal elegance: an engineer
who knows how one table pair behaves knows them all. Dev sees staging data (what the
team is editing — what you *want* while developing), prod sees synced data.

**Why not per-client flag:** A "reads_test_table" boolean per client invites exactly
the situation we're escaping — some prod clients on staging data. There is no valid
production use of the staging table; making it unexpressible is the point.

**Why not separate DATABASE_URL/schema routing:** Heavier operationally (two
connection pools, Prisma multi-datasource friction) for zero additional benefit at
one-database scale.

---

## D8. Cohort migration with per-client parity gates vs big-bang cutover

### Reasoning

**Why cohorts + parity gate:** The two frameworks compute the "same" numbers through
different code paths, and history says they diverge in edge cases (that's why
`ACCOUNT_INCEPTION_OVERRIDES` and the NAV-100 prepend exist). The parity script
(legacy `/api/portfolio` vs new `/api/bifurcated-portfolio`, exact-match cash /
±0.01 percentages) converts "hope they match" into a mechanical gate, per client,
*before* any client sees the new numbers. Cohorts of ~5 bound the blast radius and
let early cohorts debug the process for later ones. Zerodha/Radiance first because
their tag conventions already exist in the bifurcated table (verified in the
2026-06-09 probe); Jainam last because it needs a semantics decision (D9).

**Why not big-bang:** Saves calendar time only if nothing diverges — and if
something diverges, every managed-account client is wrong simultaneously, with
rollback pressure working against careful diagnosis. Financial dashboards should
never trade correctness confidence for calendar time.

**Key enabler (and why the flip is safe):** `app/dashboard/page.tsx` consults the
registry *before* falling through to the legacy path. So "insert config row" is the
entire cutover, and `is_enabled = false` is the entire rollback — no deploy in
either direction. This property is *why* D3's DB config makes the migration itself
safer, not just onboarding.

**Cost accepted:** Weeks of both frameworks live in parallel; the parity script and
dual attention are the price of never showing a client a wrong number.

---

## D9. Jainam deposits: restate data as cashflows vs `deposit_mode` engine flag

### The mismatch

`JainamManagedStrategy.getAmountDeposited` reads the *latest level* of
`Jainam Total Portfolio Deposit` (`findFirst` desc → `portfolio_value`). Everything
else in both frameworks sums `capital_in_out` flows. Two irreconcilable semantics
for the same card.

### Options and reasoning

- **Restate (preferred if feasible):** Data team decomposes the deposit level into
  dated `capital_in_out` rows during migration. *Why preferred:* it makes Jainam
  ordinary — the cashflow table, monthly `capitalInOut` cells, and the deposit card
  all become consistent and the engine stays flag-free. *Risk:* requires the true
  flow history; if only the level survives, the restatement would be fabricated
  (e.g. one synthetic flow at inception) which misstates the cashflow *table* even
  though the total is right.
- **`deposit_mode` column ('sum' | 'level'):** One small engine branch. *Why
  acceptable fallback:* honest about the data we actually have; no fabricated rows.
  *Cost:* permanent semantic fork in the engine and a config flag that exists for
  a handful of accounts.

**Decision deferred to Phase 0 deliberately** — it depends on facts we don't have
(how many Jainam accounts remain active; whether flow history exists). Encoding the
decision now would be guessing; the plan instead encodes the *decision procedure*:
if true flow history exists → restate; else → `deposit_mode`.

---

## D10. Loader fallback to static TS registry during transition

**Why:** Phase 2 swaps the source of truth for *which clients get which dashboard* —
the highest-leverage failure point in the plan. If the config tables are empty
(backfill not run), unreachable, or wrong, the fallback means the worst case is
"today's behavior," not "no dashboards." It converts a potential sev-1 into a log
line.

**Why it must be temporary (deleted Phase 4):** A permanent fallback is a hybrid
source of truth (rejected in D3). Worse, a *silent* fallback could mask a dead
config table for months until someone notices new clients aren't appearing. The
fallback logs loudly and has a scheduled removal.

**Why cache with short TTL:** Config is read on every dashboard request but changes
~weekly. Per-request reads add a DB round-trip to the hottest path for no freshness
benefit; a long/indefinite cache makes "insert row → client live" unpredictable
across serverless instances. A short TTL (~60s) keeps onboarding effectively
instant while amortizing the read to ~zero. No invalidation endpoint needed at this
change rate — TTL is the invalidation.

---

## D11. Scope exclusions: PMS, Sarla/Satidham, prop accounts

**Why excluded:** Each rides a genuinely different data shape, not just different
tags:

- **PMS** reads `pms_master_sheet` keyed by `custodian_code` (not qcode) with its
  own column set (`report_date`, `cash_in_out`, `drawdown_percent`) and a working
  strategy class. Nothing about the managed-account debt applies to it.
- **Sarla/Satidham** (`sarla-utils.ts`, ~3000 lines) have cross-account scheme
  overrides, hardcoded frozen data, and per-scheme source flags — a restructuring of
  comparable size to this whole plan. Coupling them would double the risk of both.
  They *do* get the Phase 2 env-correct table fix (it's a one-line change where they
  already read the bifurcated table), because leaving them on the `_test` table in
  prod would undermine D2's goal.
- **Prop accounts** have user-selectable tags — a different product behavior, listed
  as Phase 5 only because the config tables *could* absorb them later.

**Principle:** scope by *shared failure mode* (managed accounts all suffer the same
four debts), not by "while we're in there." Every addition to scope multiplies the
parity-testing surface.

---

## D12. Precomputed PnL tables (Phase 5) — why deferred, not done now

The DB already has `monthly_pnl` / `quarterly_pnl` / `yearly_performance` tables,
suggesting an earlier precompute attempt. Materializing engine output would cut
dashboard latency and give the data team a place to *verify* numbers before clients
see them. Deferred because: (a) it changes where correctness lives (sync-time vs
request-time) which deserves its own design; (b) doing it *during* the migration
would mean parity-testing three sources instead of two; (c) no current latency
complaint justifies buying that complexity now.

---

## Cross-cutting principles applied

1. **Additive before destructive.** Every phase creates the new thing alongside the
   old (twin table, config tables + fallback, registry-before-legacy routing) and
   deletes only after soak. Nothing in Phases 0–3 is irreversible.
2. **Move failures to write-time, keep the dashboard read-only.** Constraints and
   validation scripts push errors to the data pipeline where they're loud and owned;
   the dashboard app never gains a write path (CLAUDE.md mandate).
3. **Config is data; behavior is code.** Tags, dates, labels, render modes → rows.
   Math and control flow → one engine. The Strategy pattern's demise falls out of
   this line, and so does keeping Dinesh's frozen-data oddity in code.
4. **Decide with facts, not guesses.** Phase 0 exists so that the two genuinely open
   calls (Jainam semantics, active-client list) are made from an audit, not
   assumptions. The plan encodes decision procedures where facts are missing.
5. **Blast-radius budgeting.** Cohorts, per-client flags, fallbacks, and scope
   exclusions all serve one number: the maximum count of clients who can see a wrong
   dashboard at once. The plan keeps that number ≤ 5 at every step.
