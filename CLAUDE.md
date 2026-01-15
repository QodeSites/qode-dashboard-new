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
