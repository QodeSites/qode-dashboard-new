# Managed Accounts — Database Restructuring into the Bifurcated Framework

**Date:** 2026-07-06
**Status:** Draft plan for review
**Scope:** All `managed_account` clients (Zerodha / Radiance / Jainam) currently served by the legacy Strategy pattern, plus the database structures behind the new bifurcated framework.
**Design rationale:** Alternatives considered and trade-offs for every decision below are recorded in `docs/superpowers/specs/2026-07-06-managed-accounts-db-restructuring-tradeoffs.md`.

---

## 1. Where we are today

### 1.1 Two parallel frameworks serve managed accounts

| | Legacy framework | New (bifurcated) framework |
|---|---|---|
| Data table | `master_sheet` (live) / `master_sheet_test` (dev) | `bifurcated_master_sheet_test` (**only** table — no live twin) |
| Engine | `ZerodhaManagedStrategy`, `JainamManagedStrategy`, `PmsStrategy` in `app/lib/portfolio-utils.ts` | `BifurcatedPortfolioEngine` in `app/lib/bifurcated-portfolio-utils.ts` |
| Client config | Hardcoded tag maps inside strategy classes + `accounts.strategy` column | ~33 per-client TS files in `app/lib/clients/` + `BIFURCATED_CLIENTS` array in `app/lib/bifurcated-clients-registry.ts` |
| API | `/api/portfolio` (via `getUserQcodes` → `calculatePortfolioMetrics`) | `/api/bifurcated-portfolio`, `/api/bifurcated-holdings` |
| Routing | `app/dashboard/page.tsx` falls through to `ManagedAccounts` | `findByIcode()` registry hit at the top of `app/dashboard/page.tsx` |

Special cases that straddle both: `sarla-utils.ts` (some schemes read `bifurcated_master_sheet_test` via a per-scheme flag), `distributor-utils.ts`, `aum-utils.ts` (raw SQL against the bifurcated table), `dinesh-utils.ts` (legacy per-client engine, superseded by the registry).

### 1.2 Pain points this restructuring must fix

1. **Production reads a `_test` table.** `BifurcatedPortfolioEngine.msTable` routes to `bifurcated_master_sheet_test` unconditionally. This breaks the documented test → live sync workflow (staging tables are supposed to be team-editable and invisible to clients). One bad staging write is instantly client-visible.
2. **Tag-soup in `master_sheet`.** Semantics live in `system_tag` string conventions (`Zerodha Total Portfolio`, `Total Portfolio Exposure`, `Jainam Total Portfolio Deposit`, `QAW++ Zerodha Total Portfolio`, `<X> Net ...` twins). Nothing enforces them; each engine re-hardcodes them.
3. **No uniqueness / weak indexing.** `bifurcated_master_sheet_test` has no unique key on `(qcode, date, system_tag)` — duplicate rows silently double portfolio values. Its only index is `(qcode, date)`, but every engine query also filters `system_tag`.
4. **Onboarding requires a code deploy.** Each new client = a new TS config file + registry entry + build + release. The registry is already 33 entries and growing; the file itself admits config drift (a stale comment says Shilpa/Vikram are "not in this registry" while both are).
5. **Engine duplication.** NAV/CAGR/drawdown/monthly-PnL math is re-implemented in `portfolio-utils.ts`, `bifurcated-portfolio-utils.ts`, `sarla-utils.ts`, `dinesh-utils.ts`, `distributor-utils.ts`. `app/lib/portfolio-utils copy.ts` is dead code.
6. **Hardcoded data in code.** `ACCOUNT_INCEPTION_OVERRIDES` (portfolio-utils.ts:14), frozen scheme data, broker labels in the registry — all belong in data, not source.

---

## 2. Target state

```
                       ┌──────────────────────────────┐
   data team (staging) │ bifurcated_master_sheet_test │──sync──┐
                       └──────────────────────────────┘        ▼
                                                   ┌──────────────────────────┐
                       clients (prod)              │ bifurcated_master_sheet  │
                                                   └──────────────────────────┘
                                                              ▲
   ┌────────────────────────┐    ┌──────────────────────┐     │
   │ dashboard_client_config │──▶│ BifurcatedPortfolio  │─────┘
   │ + dashboard_scheme_config│  │ Engine (single engine)│
   └────────────────────────┘    └──────────────────────┘
        (replaces app/lib/clients/*.ts + registry array)
```

- **One data table pair**: `bifurcated_master_sheet` (live) + `bifurcated_master_sheet_test` (staging), selected by `NODE_ENV` exactly like `master_sheet` vs `master_sheet_test` today.
- **One engine**: `BifurcatedPortfolioEngine`, config-driven.
- **DB-driven config**: two new tables replace the TS registry; onboarding a client becomes a data operation, no deploy.
- **Legacy managed strategies retired**: `ZerodhaManagedStrategy` and `JainamManagedStrategy` deleted once their remaining clients are migrated; `PmsStrategy` stays (PMS is out of scope).

### 2.1 New / changed tables (DDL owned by the data team — dashboard stays read-only)

```sql
-- 1. Live twin of the staging table (same columns)
CREATE TABLE bifurcated_master_sheet (LIKE bifurcated_master_sheet_test INCLUDING ALL);

-- 2. Integrity + query-shaped indexes on BOTH tables
ALTER TABLE bifurcated_master_sheet
  ADD CONSTRAINT uq_bif_ms_qcode_date_tag UNIQUE (qcode, date, system_tag);
CREATE INDEX idx_bif_ms_qcode_tag_date ON bifurcated_master_sheet (qcode, system_tag, date);
-- (repeat on bifurcated_master_sheet_test; dedupe first — see Phase 1)

-- 3. Client-level dashboard config (replaces BIFURCATED_CLIENTS array)
CREATE TABLE dashboard_client_config (
  id            SERIAL PRIMARY KEY,
  icode         VARCHAR(20) NOT NULL UNIQUE REFERENCES clients(icode),
  qcode         VARCHAR(20) NOT NULL REFERENCES accounts(qcode),
  display_name  VARCHAR(255) NOT NULL,
  render_mode   VARCHAR(10) NOT NULL DEFAULT 'multi',   -- 'multi' | 'single'
  broker_label  VARCHAR(50),
  qode_total_portfolio_tag VARCHAR(100) DEFAULT 'Qode Total Portfolio',
  has_nav_based_total_portfolio BOOLEAN NOT NULL DEFAULT true,
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 4. Scheme-level config (replaces portfolioMapping in per-client TS files)
CREATE TABLE dashboard_scheme_config (
  id             SERIAL PRIMARY KEY,
  client_config_id INT NOT NULL REFERENCES dashboard_client_config(id) ON DELETE CASCADE,
  scheme_name    VARCHAR(100) NOT NULL,     -- e.g. 'Scheme QAW++'
  exposure_tag   VARCHAR(100) NOT NULL,     -- current / metrics / deposit tag
  profit_tag     VARCHAR(100) NOT NULL,     -- NAV-curve tag
  cashflow_tag   VARCHAR(100),              -- optional override (2026-06-09 design)
  inception_date DATE NOT NULL,
  inception_nav  DECIMAL(20,4) DEFAULT 100, -- absorbs ACCOUNT_INCEPTION_OVERRIDES
  is_active      BOOLEAN NOT NULL DEFAULT true,
  display_amount_invested_as_zero BOOLEAN NOT NULL DEFAULT false,
  sort_order     INT DEFAULT 0,
  UNIQUE (client_config_id, scheme_name)
);
```

Notes:
- Column shapes mirror what `defineBifurcatedClient` / `defineSingleStrategyClient` already produce, so the loader is a mechanical mapping into the existing `ClientConfig` type — the engine internals do not change.
- `capital_in_out` table already exists for cashflow provenance; not touched in this phase.
- Vestigial `ClientConfig` fields (`oldSchemeName`, `oldFinalNav`, `oldScheme*Tag`, `accountCode`) are NOT modeled — the loader fills the same sentinels the builders use today (`"__no_old_scheme__"` etc.). Verbose legacy configs (Dinesh QTF carve-out) keep their TS files until Phase 5.

---

## 3. Phased plan

### Phase 0 — Inventory & audit (read-only, no risk)

1. **Script `scripts/audit-managed-accounts.ts`** (pattern: existing `scripts/investigate-*.ts`, run with `npx tsx`):
   - List every `accounts` row with `account_type = 'managed_account'`, joined to `pooled_account_users` → icode.
   - Partition into: (a) already in `BIFURCATED_CLIENTS`, (b) legacy Zerodha/Radiance, (c) legacy Jainam.
   - For each legacy qcode, enumerate `DISTINCT system_tag` in `master_sheet` and row counts/date ranges.
2. **Script `scripts/audit-bifurcated-integrity.ts`**:
   - Duplicate check: `GROUP BY qcode, date, system_tag HAVING COUNT(*) > 1` on `bifurcated_master_sheet_test`.
   - Per registry client: verify `Qode Total Portfolio` coverage, min(date) vs configured inception, base-tag = sum-of-scheme-tags tie-out (same probe as the 2026-06-09 design).
3. Output a migration worksheet (one row per legacy client: qcode, icode, tags found, proposed scheme config) — this is the hand-off artifact for the data team.

**Exit criteria:** signed-off list of clients to migrate + confirmed clean/dirty state of the bifurcated table.

### Phase 1 — Database restructuring (data team executes; we supply DDL + Prisma diff)

1. Dedupe `bifurcated_master_sheet_test` (from Phase 0 findings), then apply unique constraint + `(qcode, system_tag, date)` index.
2. Create `bifurcated_master_sheet` (live) and the sync job mirroring the existing `master_sheet_test → master_sheet` process (reuse `master_sheet_sync_logs` pattern; add `bifurcated` sync_type or a twin log table).
3. Create `dashboard_client_config` + `dashboard_scheme_config`.
4. Update `prisma/schema.prisma` with the three new models; `npx prisma generate`. (Schema addition only — the dashboard app never writes these tables.)

**Exit criteria:** live table exists and is byte-identical to staging for all currently-registered clients; `npm run build` passes with new Prisma client.

### Phase 2 — Engine reads env-correct table + config loader (code, backward compatible)

1. In `bifurcated-portfolio-utils.ts`, change the `msTable` getter to env-based selection:
   `NODE_ENV === 'development' ? prisma.bifurcated_master_sheet_test : prisma.bifurcated_master_sheet` (preserving the existing `qodeTotalPortfolioTag` opt-in that distinguishes bifurcated clients from `master_sheet` readers). Apply the same switch to the raw SQL in `aum-utils.ts`, the reads in `distributor-utils.ts`, and the flagged schemes in `sarla-utils.ts`.
2. Add `app/lib/bifurcated-config-loader.ts`:
   - `loadBifurcatedClients(): Promise<BifurcatedClientEntry[]>` reading the two config tables and mapping rows → `ClientConfig` via the exact logic of `defineBifurcatedClient` / `defineSingleStrategyClient`.
   - In-memory cache with short TTL (config changes rarely; avoids a DB hit per request).
   - **Fallback:** if the tables are empty/unreachable, fall back to the static `BIFURCATED_CLIENTS` array and log. This keeps the deploy zero-risk.
3. Replace direct `findByIcode`/`findByQcode` imports (dashboard page, both bifurcated API routes, holdings page, `download-all-excels`, distributor utils) with async loader equivalents.
4. Backfill script `scripts/generate-config-inserts.ts`: serialize the current 33 registry entries into `INSERT` statements for the data team (we do not execute writes).

**Verification:** for every registry icode, diff `/api/bifurcated-portfolio?qcode=...` JSON before vs after (static vs DB config) — must be byte-identical. `npm run build` + safety checklist (no write ops).

### Phase 3 — Migrate remaining legacy managed accounts

Per client (cohorts of ~5, Zerodha/Radiance first, Jainam last since it needs new tag conventions):

1. Data team populates `bifurcated_master_sheet_test` for the qcode (per-scheme tags + `Qode Total Portfolio` rows), syncs to live.
2. Data team inserts `dashboard_client_config` + `dashboard_scheme_config` rows (single-strategy clients get `render_mode = 'single'`).
3. Run `scripts/validate-bifurcated-registry.ts` (extend it to validate DB-sourced config, not just the TS array).
4. **Parity gate:** new comparison script fetches the legacy `/api/portfolio` result and the new `/api/bifurcated-portfolio` result for the icode and diffs: amountDeposited, currentExposure, return, totalProfit, trailing returns, equity-curve endpoints, monthly PnL. Tolerance: exact for cash figures, ±0.01 for percentages.
5. Flip: because `app/dashboard/page.tsx` checks the registry **before** falling through to `ManagedAccounts`, adding the config row *is* the cutover. Rollback = set `is_enabled = false` (loader filters on it).

Jainam specifics: its deposit is a **level** (`findFirst` on `Jainam Total Portfolio Deposit`) not a cashflow sum — data team must restate it as `capital_in_out` rows under the scheme tag, or we add a `deposit_mode` column to `dashboard_scheme_config` ('sum' | 'level') and a small engine branch. Decide during Phase 0 based on how many Jainam clients remain.

Also fold in the hardcoded exceptions:
- `ACCOUNT_INCEPTION_OVERRIDES['QAC00071']` → `inception_date`/`inception_nav` columns for Arwani.
- Sarla/Satidham stay on `sarla-utils.ts` for now (own restructuring, out of scope) but their bifurcated reads follow the env-correct table from Phase 2.

### Phase 4 — Retire legacy code

Only after every managed account is served by the new framework:

1. Delete `ZerodhaManagedStrategy`, `JainamManagedStrategy` from `portfolio-utils.ts`; `getDataFetchingStrategy` keeps only `PmsStrategy` (throwing for managed accounts, which should be unreachable).
2. Delete `app/lib/portfolio-utils copy.ts` (dead), `app/lib/dinesh-utils.ts` (superseded), and the per-client TS config files + static registry array once the DB config has soaked for a few weeks.
3. Update `CLAUDE.md`: new tables, new onboarding runbook (rewrite `docs/how-to-add-a-bifurcated-client.md` — steps become "insert two config rows + validate", no deploy).

### Phase 5 — Nice-to-haves (separate approvals)

- Fold `master_sheet` prop-account usage (`/api/prop`, `prop_account_default_tags`) into the same config tables.
- Admin UI (internal-only) for viewing config rows — read-only in this app; edits stay with the data team.
- Consider `monthly_pnl` / `quarterly_pnl` precomputed tables as materialized outputs of the sync job instead of on-request computation.

---

## 4. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Staging table currently IS production — any restructuring touches live client data | Phase 1 creates the live twin **before** anything else changes; staging edits stop being client-visible from Phase 2 onward |
| Dedupe/unique-constraint reveals conflicting rows | Phase 0 audit surfaces them first; data team resolves before DDL |
| DB config diverges from TS registry during transition | Loader fallback + Phase 2 byte-identical diff gate; TS files deleted only in Phase 4 |
| Legacy vs new numbers differ for a migrated client | Per-client parity gate (Phase 3.4) blocks cutover; `is_enabled=false` instant rollback |
| Jainam deposit semantics don't fit the engine | Explicit decision point in Phase 0; `deposit_mode` column as escape hatch |
| Read-only mandate (CLAUDE.md) | All writes (DDL, inserts, sync) executed by the data team from generated scripts; dashboard code adds only `findMany`/`findFirst` reads |

## 5. Open questions (need answers before Phase 1)

1. Which legacy managed-account clients are actually still active? (Phase 0 script answers the list; product confirms who to migrate vs archive.)
2. Does the data team's pipeline already write per-scheme tags for the legacy Zerodha clients, or only base tags? (Determines their backfill effort.)
3. Jainam: restate deposits as cashflows, or add `deposit_mode`?
4. Sync cadence for `bifurcated_master_sheet_test → bifurcated_master_sheet` — same trigger as `master_sheet`, or independent?
5. Should Sarla/Satidham's bifurcated schemes be folded into `dashboard_scheme_config` in this effort or a follow-up? (Recommendation: follow-up.)

## 6. Verification checklist (applies to every code phase)

- [ ] No `create` / `update` / `delete` / `upsert` / write `$executeRaw` introduced
- [ ] `npm run build` passes
- [ ] `npx tsx scripts/validate-bifurcated-registry.ts` exits 0
- [ ] API JSON diff clean for all existing registry clients
- [ ] Existing PMS / prop / Sarla / Satidham dashboards unaffected
