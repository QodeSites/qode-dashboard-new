# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
npm run dev      # Start development server on port 2030
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Database Commands

```bash
npx prisma generate          # Generate Prisma client after schema changes
npx prisma db push           # Push schema changes to database
npx prisma studio            # Open Prisma Studio for database browsing
```

## Architecture Overview

This is a **Next.js 15** client dashboard application for Qode, a financial portfolio management system. It uses the App Router pattern with React 19.

### Key Directories

- `app/` - Next.js App Router pages and API routes
- `app/api/` - API route handlers (all use `getServerSession` for auth)
- `app/lib/` - Server-side utilities and data fetching logic
- `components/` - React components (UI primitives in `components/ui/`)
- `components/dashboard/` - Dashboard view components by account type
- `lib/` - Shared utilities (Prisma client, Zoho SDK)
- `hooks/` - Custom React hooks
- `prisma/` - Database schema (PostgreSQL)

### Authentication

Uses **NextAuth.js** with two credential providers:
1. Standard login (email/icode + password) for clients
2. Internal access via JWT tokens for internal staff viewing client dashboards

Auth configuration: `app/api/auth/[...nextauth]/route.ts`

Session contains: `user.icode`, `user.name`, `user.email`, `user.accessType`

### Account Types and Data Strategies

The system uses a **Strategy pattern** for data fetching (`app/lib/portfolio-utils.ts`). Each account type has a dedicated class implementing `DataFetchingStrategy`:

1. **PmsStrategy** - For PMS accounts. Uses `pms_master_sheet` table, links accounts via `account_custodian_codes`
2. **ZerodhaManagedStrategy** - For Zerodha/Radiance managed accounts. Uses `master_sheet` with system tags
3. **JainamManagedStrategy** - For Jainam managed accounts. Similar structure with different tag mappings

Strategy selection happens in `getDataFetchingStrategy()` based on `account_type` and `broker`.

**System Tags** control which data series to use:
- Deposit tags: `'Zerodha Total Portfolio'`, `'Total Portfolio Exposure'`
- NAV tags: `'Total Portfolio Value'`
- Radiance broker always uses `'Total Portfolio Exposure'`

### Prop Accounts

Prop accounts have configurable tags (unlike other account types):
- Users select deposit/NAV/cashflow tags from available `system_tag` values
- Default tags can be saved per account in `prop_account_default_tags` table
- API: `/api/prop` for data, `/api/prop/default-tags` for preferences

### Dashboard Components

The main dashboard (`app/dashboard/page.tsx`) renders different components based on account type:
- `Pms` - PMS account view with benchmark comparisons
- `ManagedAccounts` - Futures/managed account view
- `PropAccounts` - Proprietary trading view with tag selection
- `SarlaSatidham` - Special consolidated view for specific users (QUS0007, QUS0010)

### Return Calculations

Returns are calculated differently based on holding period:
- **< 365 days**: Absolute return `((finalNav / initialNav) - 1) * 100`
- **>= 365 days**: CAGR `(Math.pow(finalNav / initialNav, 365 / days) - 1) * 100`

NAV curves start at 100 (prepended if not present in data).

### Environment-Based Table Selection

Development (`NODE_ENV === 'development'`) uses `*_test` tables:
- `master_sheet_test` instead of `master_sheet`
- `equity_holding_test` instead of `equity_holding`
- `mutual_fund_holding_sheet_test` instead of `mutual_fund_holding_sheet`

### Test vs Live Data Workflow

Tables with `_test` suffix (e.g., `master_sheet_test`) are staging tables where the team makes changes. These sync to the live tables (e.g., `master_sheet`) when manually triggered by the team. Clients always see data from the live (non-test) tables. Core tables like `clients`, `accounts`, `pooled_account_users` do not have test variants.

### Key Identifiers

- **qcode** - Account identifier (format: `QAC00001`)
- **icode** - Client/user identifier (format: `QUS0001`)
- **custodian_code** - Links PMS accounts to their data in `pms_master_sheet`

### Type Definitions

Core types in `app/lib/dashboard-types.ts`:
- `Stats` - Normalized portfolio statistics (used for display)
- `PmsStats` - PMS-specific format (converted to Stats via `normalizeToStats`)
- `Account` - Account info with qcode, name, type, broker
- `Metadata` - Response metadata with dates, filters, strategy name

### External Integrations

**Zoho CRM SDK** (`lib/zoho-sdk.ts`):
- Singleton pattern for token management
- Auto-refreshes access tokens
- Used for syncing client data from Zoho CRM
- Requires env vars: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_DC`

### UI Framework

**Tailwind CSS** with custom theme colors (defined in `tailwind.config.ts`):
- `primary-bg`: `#EFECD3` (cream background)
- `logo-green`: `#02422B` (dark green)
- `button-text`: `#DABD38` (gold)
- `card-text`: `#002017` (dark)
- `card-text-secondary`: `#37584F` (muted green)

**Component Library**: Radix UI primitives via shadcn/ui in `components/ui/`

**Fonts**: Plus Jakarta Sans (sans), Playfair Display (serif), Inria Serif (heading)

### Path Aliases

Uses `@/*` for root-relative imports (configured in `tsconfig.json`).

### Key Database Models

- `accounts` - Trading accounts with qcode identifiers
- `clients` - Users with icode identifiers
- `master_sheet` / `pms_master_sheet` - Daily portfolio NAV, drawdown, P&L metrics
- `equity_holding` / `mutual_fund_holding_sheet` - Current holdings by symbol
- `pooled_account_users` / `pooled_account_allocations` - Account access relationships
- `capital_in_out` - Cash flow transactions
- `pms_clients_master` - PMS client profiles with onboarding status

### API Response Pattern

Portfolio APIs return:
```typescript
{
  data: Stats,
  metadata: {
    icode: string,
    accountCount: number,
    inceptionDate: string | null,
    dataAsOfDate: string | null,
    strategyName: string,
    filtersApplied: {...}
  }
}
```

---

## Sarla & Satidham Special Users

Sarla and Satidham are special high-value clients with custom dashboard logic in `app/lib/sarla-utils.ts`. They bypass the normal Strategy pattern and have their own data processing.

### Account Relationships

| User | Client (icode) | Account (qcode) | PMS Custodian | Notes |
|------|----------------|-----------------|---------------|-------|
| **Sarla** | `QUS0007` | `QAC00041` | `QAW00041` | Uses accountCode `AC5` |
| **Satidham (Old)** | `QUS0010` | `QAC00046` | `QAW00041` | Uses accountCode `AC8` |
| **Satidham (New)** | `QUS00081` | `QAC00066` | - | Linked to QUS0010 via "Scheme QAW++ QUS00081" |

### System Tags Mapping

**Sarla (QAC00041)**:
| Scheme | System Tag |
|--------|------------|
| Total Portfolio | `Sarla Performance fibers Scheme Total Portfolio` |
| Scheme B | `Total Portfolio Value` |
| Scheme QAW | `Zerodha Total Portfolio QAW` |
| Scheme A | `Zerodha Total Portfolio A` |
| Scheme PMS QAW | `PMS QAW Portfolio` |

**Satidham (QAC00046)**:
| Scheme | System Tag | Source qcode |
|--------|------------|--------------|
| Total Portfolio | `Total Portfolio Value A` | QAC00046 |
| Scheme A | `Total Portfolio Value A` | QAC00046 |
| Scheme B | `Total Portfolio Value B` | QAC00046 |
| Scheme A (Old) | `Total Portfolio Value Old` | QAC00046 |
| Scheme PMS QAW | `PMS QAW Portfolio` | QAC00046 |
| Scheme QAW++ QUS00081 | `Zerodha Total Portfolio` | **QAC00066** (override) |

### Cross-Account Data Fetching

Some schemes fetch data from a different qcode than the user's default. This is controlled by `SCHEME_QCODE_OVERRIDE` in `sarla-utils.ts`:

```typescript
private static readonly SCHEME_QCODE_OVERRIDE: Record<string, string> = {
  "Scheme QAW++ QUS00081": "QAC00066", // Fetches from QAC00066 instead of QAC00046
};
```

The `getEffectiveQcode()` helper resolves the correct qcode for any scheme.

---

## Critical Files

| File | Purpose | Size |
|------|---------|------|
| `app/lib/sarla-utils.ts` | Sarla/Satidham data processing, scheme logic, hardcoded data | ~3000 lines |
| `app/lib/portfolio-utils.ts` | Strategy pattern for regular accounts (PMS, Zerodha, Jainam) | ~800 lines |
| `app/lib/dashboard-types.ts` | TypeScript type definitions | ~200 lines |
| `app/api/sarla-api/route.ts` | API endpoint for Sarla/Satidham data | ~50 lines |
| `components/dashboard/SarlaSatidham.tsx` | UI component for Sarla/Satidham view | ~500 lines |

---

## Common Patterns

### Adding a New Scheme to Sarla/Satidham

1. **Add to `PORTFOLIO_MAPPING`** (in `sarla-utils.ts`):
   ```typescript
   "New Scheme Name": {
     current: "System Tag Name",
     metrics: "System Tag Name",
     nav: "System Tag Name",
     isActive: true,
   },
   ```

2. **Add to System Tags Mapping** (`SARLA_SYSTEM_TAGS` or `SATIDHAM_SYSTEM_TAGS`):
   ```typescript
   "New Scheme Name": "Database System Tag",
   ```

3. **If cross-account**, add to `SCHEME_QCODE_OVERRIDE`:
   ```typescript
   "New Scheme Name": "QAC000XX", // Target qcode
   ```

4. **Update Total Portfolio aggregation** (if scheme should be included):
   - `getAmountDeposited()` - Add to schemes array
   - `getLatestExposure()` - Add to schemes array
   - `getTotalProfit()` - Add to satidhamSchemes/sarlaSchemes array
   - `getCashFlows()` - Add to schemes array
   - `calculateMonthlyPnL()` - Add data fetching for new scheme
   - `calculateQuarterlyPnLWithDailyPL()` - Add data fetching for new scheme

5. **Add individual scheme handling** (if not using hardcoded data):
   - Add case in `getAmountDeposited()` for the specific scheme
   - The scheme will automatically work in other functions via `getEffectiveQcode()`

### Safety Verification Checklist

Before deploying any changes to `sarla-utils.ts` or `portfolio-utils.ts`:

- [ ] **No write operations**: Verify no `create`, `update`, `delete`, `upsert` Prisma calls
- [ ] **All queries are SELECT**: `findMany`, `findFirst`, `aggregate`, `count` only
- [ ] **No raw SQL writes**: No `INSERT`, `UPDATE`, `DELETE` in `$queryRaw`
- [ ] **Build passes**: Run `npm run build` successfully
- [ ] **Existing schemes unaffected**: Verify other schemes still work
- [ ] **Correct qcode used**: Verify `getEffectiveQcode()` returns expected values

### Investigating Account Relationships

To understand an account's data structure, query these tables:

```sql
-- 1. Find client info
SELECT * FROM clients WHERE icode = 'QUS0010';

-- 2. Find account access
SELECT * FROM pooled_account_users WHERE icode = 'QUS0010';

-- 3. Find account details
SELECT * FROM accounts WHERE qcode = 'QAC00046';

-- 4. Find available system tags
SELECT DISTINCT system_tag FROM master_sheet WHERE qcode = 'QAC00046';

-- 5. Find PMS linkage (if any)
SELECT * FROM account_custodian_codes WHERE qcode = 'QAC00046';
```

---

## Database Safety Rules

**CRITICAL**: All dashboard code must be READ-ONLY. Never modify client data.

### Allowed Prisma Operations
- `findMany()` - SELECT multiple rows
- `findFirst()` - SELECT single row
- `findUnique()` - SELECT by unique key
- `aggregate()` - SELECT with SUM/AVG/COUNT
- `count()` - SELECT COUNT(*)
- `$queryRaw` - Only for SELECT statements

### Forbidden Operations
- `create()` / `createMany()` - INSERT
- `update()` / `updateMany()` - UPDATE
- `delete()` / `deleteMany()` - DELETE
- `upsert()` - INSERT or UPDATE
- Any `$executeRaw` with INSERT/UPDATE/DELETE