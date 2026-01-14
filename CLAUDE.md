# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm run dev      # Start dev server on port 2030
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

### Prisma Commands

```bash
npx prisma generate         # Regenerate Prisma client after schema changes
npx prisma db push          # Push schema changes to database
npx prisma studio           # Open database GUI
```

## Architecture Overview

This is a **Next.js 15 portfolio analytics dashboard** using the App Router pattern with React 19. Focus area is **prop and managed accounts**.

### Tech Stack
- **Framework**: Next.js 15 (App Router) with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: NextAuth with JWT strategy and credentials provider
- **UI**: shadcn/ui components (Radix UI + Tailwind CSS)
- **Charts**: Recharts, Highcharts, ApexCharts

### Key Directories

```
app/
├── api/
│   ├── auth/[...nextauth]/ # NextAuth config
│   ├── portfolio/          # Regular managed account data
│   ├── sarla-api/          # Sarla/Satidham managed account data
│   └── prop/               # Prop account endpoints
├── dashboard/              # Main dashboard page
├── lib/
│   ├── portfolio-utils.ts  # Regular managed account calculations
│   ├── sarla-utils.ts      # Sarla/Satidham managed account logic
│   └── dashboard-types.ts  # Shared TypeScript types
components/
├── ui/                     # shadcn/ui components
├── dashboard/
│   ├── SarlaSatidham.tsx   # Multi-scheme managed accounts view
│   ├── ManagedAccounts.tsx # Regular managed accounts view
│   └── PropAccounts.tsx    # Prop accounts view
```

## Account Types

### 1. Managed Accounts

**Two sub-categories of managed accounts:**

#### A. Sarla/Satidham (Multi-Scheme Managed Accounts)
Special managed accounts with multiple investment schemes.

**Identification:**
- Sarla: `icode: QUS0007`, `qcode: QAC00041`
- Satidham: `icode: QUS0010`, `qcode: QAC00046`

**Key Files:**
- `app/lib/sarla-utils.ts` - Main logic and data
- `components/dashboard/SarlaSatidham.tsx` - UI component
- `app/api/sarla-api/route.ts` - API endpoint

**Scheme Structure:**
Each account has multiple schemes (Scheme A, B, C, D, E, F, QAW, Total Portfolio), each mapping to different `system_tag` in `master_sheet`:

```typescript
// app/lib/sarla-utils.ts - PORTFOLIO_MAPPING
AC5 (Sarla): {
  "Scheme B": { current: "Zerodha Total Portfolio", ... },
  "Scheme A": { current: "Zerodha Total Portfolio A", ... },
  "Total Portfolio": { current: "Sarla Performance fibers Scheme Total Portfolio", ... },
}
AC8 (Satidham): {
  "Scheme A": { current: "Total Portfolio Value A", ... },
  ...
}
```

**Hardcoded Data:**
Some historical scheme data is hardcoded in `sarla-utils.ts`:
- `SARLA_HARDCODED_DATA` - Frozen historical returns for Sarla schemes
- `SATIDHAM_HARDCODED_DATA` - Frozen historical returns for Satidham schemes
- `FROZEN_RETURN_VALUES` - Fixed return percentages for inactive schemes
- `AC5_QUARTERLY_PNL`, `AC8_QUARTERLY_PNL` - Hardcoded quarterly P&L values

#### B. Regular Managed Accounts (Broker-Based)
Standard managed accounts that use broker-based strategy pattern.

**Key Files:**
- `app/lib/portfolio-utils.ts` - Strategy classes
- `components/dashboard/ManagedAccounts.tsx` - UI component
- `app/api/portfolio/route.ts` - API endpoint

**Broker Strategies:**

| Broker | Strategy Class | System Tag Logic |
|--------|----------------|------------------|
| Jainam | `JainamManagedStrategy` | Uses "Total Portfolio Value" |
| Zerodha | `ZerodhaManagedStrategy` | Varies by strategy (QAW/QTF vs QYE) |
| Radiance | `ZerodhaManagedStrategy` | Uses "Total Portfolio Exposure" |

### 2. Prop Accounts

User-configurable accounts where clients select their own system tags.

**Key Files:**
- `components/dashboard/PropAccounts.tsx` - UI with tag selector
- `app/api/prop/default-tags/route.ts` - Save/load tag preferences
- `prop_account_default_tags` table - Storage

**Configurable Tags:**
- `depositTag` - Which column for deposit data
- `navTag` - Which column for NAV calculations
- `cashflowTag` - Which column for cash flows

## Database Models (Key Tables)

- `clients` - Users (identified by `icode`)
- `accounts` - Trading accounts (`qcode`, includes `account_type`, `broker`)
- `master_sheet` - Daily NAV/portfolio values with multiple `system_tag` columns
- `equity_holding` - Current holdings
- `capital_in_out` - Cash flow records
- `prop_account_default_tags` - Prop account tag preferences

## Client-Specific Customization Points

### For Sarla/Satidham Changes

1. **Add new scheme**: Update `PORTFOLIO_MAPPING` in `sarla-utils.ts`
2. **Update frozen returns**: Modify `FROZEN_RETURN_VALUES` or `HARDCODED_SINCE_INCEPTION_RETURNS`
3. **Update quarterly PnL**: Modify `AC5_QUARTERLY_PNL` or `AC8_QUARTERLY_PNL`
4. **Add scheme-to-tag mapping**: Update `SARLA_SYSTEM_TAGS` or `SATIDHAM_SYSTEM_TAGS`

### For Regular Managed Account Changes

1. **New broker**: Add conditionals in `ZerodhaManagedStrategy.getSystemTag()` or create new strategy class
2. **New strategy mapping**: Update strategy-to-tag conditionals in `portfolio-utils.ts`

### For Prop Account Changes

No code changes needed - users configure via UI.

## Brand Colors (Tailwind)

- `logo-green`: #02422B
- `primary-bg`: #EFECD3
- `button-text`: #DABD38
- `card-text`: #002017

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - For token signing
- `NEXTAUTH_SECRET` - NextAuth encryption
- `NEXTAUTH_URL` - Base URL for auth

## Known Issues

Merge conflict markers in `app/dashboard/page.tsx` need resolution.
