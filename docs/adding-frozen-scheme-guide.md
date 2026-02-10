# Adding a Frozen Scheme for a Special Client

This guide documents the process followed to implement the frozen QTF scheme for Dinesh Goel (QUS00072). Use this as a reference when adding similar frozen/inactive schemes for other clients.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step-by-Step Implementation](#step-by-step-implementation)
4. [Data Extraction from CSV](#data-extraction-from-csv)
5. [File Structure](#file-structure)
6. [Verification Checklist](#verification-checklist)
7. [Common Patterns](#common-patterns)

---

## Overview

### What is a "Frozen Scheme"?

A frozen scheme is an inactive investment strategy where:
- All positions have been closed
- Final withdrawal has been made
- Data is static (hardcoded) and will never change
- Displayed with "(Inactive)" label in the UI

### When to Use This Pattern

- Client has multiple schemes, some active and some closed
- Historical performance data needs to be preserved
- Scheme data should not change with new uploads

### Example: Dinesh Goel QTF Implementation

| Field | Value |
|-------|-------|
| Client Name | Dinesh Goel |
| icode | QUS00072 |
| qcode | QAC00053 |
| Account Code | AC9 |
| Scheme Name | Scheme QTF |
| System Tag | `QTF Zerodha Total Portfolio` |
| Status | Frozen/Inactive |

---

## Prerequisites

### 1. Identify Client Information

```sql
-- Find client info
SELECT * FROM clients WHERE name LIKE '%Dinesh%';

-- Find account access
SELECT * FROM pooled_account_users WHERE icode = 'QUS00072';

-- Find account details
SELECT * FROM accounts WHERE qcode = 'QAC00053';

-- Find available system tags
SELECT DISTINCT system_tag FROM master_sheet WHERE qcode = 'QAC00053';
```

### 2. Understand System Tag Conventions

There are typically TWO types of system tags per scheme:

| Tag Type | Purpose | Example |
|----------|---------|---------|
| `*Total Portfolio Value` | Daily NAV tracking, margin settlements | `QTF Total Portfolio Value` |
| `*Zerodha Total Portfolio` | Discrete capital events (deposits/withdrawals) | `QTF Zerodha Total Portfolio` |

**Important**: For equity curves and returns, use the `*Zerodha Total Portfolio` tag as it tracks actual capital events.

### 3. Export Scheme Data to CSV

Export the master_sheet data for the specific system tag:

```sql
SELECT * FROM master_sheet
WHERE qcode = 'QAC00053'
AND system_tag = 'QTF Zerodha Total Portfolio'
ORDER BY date ASC;
```

Save as CSV (e.g., `data/dinesh_qtf_only_mastersheet.csv`)

---

## Step-by-Step Implementation

### Step 1: Create the Utility File

Create `app/lib/{client}-utils.ts` following the pattern in `sarla-utils.ts`.

```typescript
// app/lib/dinesh-utils.ts

import { NextResponse } from "next/server";

// 1. Define interfaces (copy from sarla-utils.ts)
interface CashFlow { ... }
interface QuarterlyPnL { ... }
interface MonthlyPnL { ... }
interface PortfolioData { ... }
interface Metadata { ... }
interface PortfolioResponse { ... }
interface PortfolioConfig { ... }

// 2. Define portfolio mapping
const PORTFOLIO_MAPPING: Record<string, Record<string, PortfolioConfig>> = {
  "AC9": {  // Account code for this client
    "Scheme QTF": {
      current: "QTF Zerodha Total Portfolio",
      metrics: "QTF Zerodha Total Portfolio",
      nav: "QTF Zerodha Total Portfolio",
      isActive: false,  // FROZEN
    },
  },
};

// 3. Create PortfolioApi class with hardcoded data
export class PortfolioApi {
  private static readonly SYSTEM_TAGS: Record<string, string> = {
    "Scheme QTF": "QTF Zerodha Total Portfolio",
  };

  private static HARDCODED_DATA: Record<string, PortfolioData & { metadata: Metadata }> = {
    "Scheme QTF": {
      data: { /* frozen values */ },
      metadata: { /* metadata */ },
    },
  };

  public static async GET(request: Request): Promise<NextResponse> {
    // Return hardcoded data
  }
}
```

### Step 2: Create the API Route

Create `app/api/{client}-api/route.ts`:

```typescript
// app/api/dinesh-api/route.ts

import { PortfolioApi } from '@/app/lib/dinesh-utils';

export const GET = PortfolioApi.GET;
```

### Step 3: Update Dashboard Page

Modify `app/dashboard/page.tsx`:

#### 3a. Add client detection

```typescript
// Around line 229
const isDinesh = session?.user?.icode === "QUS00072";
```

#### 3b. Add fetch function

```typescript
const fetchDineshData = async () => {
  try {
    const response = await fetch("/api/dinesh-api");
    if (!response.ok) throw new Error("Failed to fetch");
    const data = await response.json();
    // Process data similar to fetchSarlaData
  } catch (error) {
    console.error("Error fetching Dinesh data:", error);
  }
};
```

#### 3c. Add useEffect branch

```typescript
useEffect(() => {
  if (isDinesh) {
    fetchDineshData();
  } else if (isSarla || isSatidham) {
    fetchSarlaData();
  } else {
    // regular flow
  }
}, [session]);
```

#### 3d. Add render function

```typescript
const renderDineshContent = () => {
  // Similar to renderSarlaContent
  return <SarlaSatidham ... />;
};
```

#### 3e. Update return statement

```typescript
return (
  <div>
    {isDinesh ? renderDineshContent() :
     isSarla || isSatidham ? renderSarlaContent() :
     renderRegularContent()}
  </div>
);
```

---

## Data Extraction from CSV

### CSV Column Mapping

The master_sheet CSV has these columns (0-indexed):

| Index | Column | Description |
|-------|--------|-------------|
| 0 | system_tag | Tag identifier |
| 1 | date | Trading date |
| 2 | daily_pl_nav | Current portfolio value |
| 3 | capital_in_out | Deposit/withdrawal amount |
| 4 | nav_100 | NAV (base 100) |
| 5 | prev_nav_100 | Previous day NAV |
| 6 | daily_pl | Daily P&L (absolute) |
| 7 | daily_pct_return | Daily return % |
| 12 | drawdown | Current drawdown % |

### Extract Equity Curve

```bash
# Using grep to extract data for specific tag
grep "QTF Zerodha Total Portfolio" data/dinesh_qtf_only_mastersheet.csv
```

Parse each line to extract:
- `date` (column 1)
- `nav` (column 4 - nav_100)

### Extract Drawdown Curve

Same data, extract:
- `date` (column 1)
- `drawdown` (column 12)

### Calculate Key Metrics

#### Return Calculation
```
Return = (Final NAV / First NAV - 1) * 100
Example: (113.57 / 99.66 - 1) * 100 = 13.95%
```

#### MDD (Maximum Drawdown)
```
MDD = MIN(all drawdown values)
Example: -2.53% (occurred on 2025-10-28)
```

#### Current Drawdown
```
Current DD = Last drawdown value
Example: -0.07%
```

#### Total Profit
```
Total Profit = Final Withdrawal - Initial Deposit
Example: 56,805,342.00 - 49,999,904.70 = 6,805,437.30
```

### Calculate Monthly P&L

For each month:
```
Month Return = (End of Month NAV / End of Previous Month NAV - 1) * 100
```

Example:
- September: (105.81 / 101.24 - 1) * 100 = 4.51%

### Calculate Quarterly P&L

For each quarter:
```
Q3 2025 (Aug-Sep): (105.81 / 99.66 - 1) * 100 = 6.17%
Q4 2025 (Oct-Dec): (111.93 / 105.81 - 1) * 100 = 5.78%
Q1 2026 (Jan): (113.57 / 111.93 - 1) * 100 = 1.47%
```

### Calculate Trailing Returns

Count back trading days from the last date:
```
5d trailing: Compare last NAV vs NAV 5 trading days ago
10d trailing: Compare last NAV vs NAV 10 trading days ago
```

---

## File Structure

```
qode-dashboard-new/
├── app/
│   ├── api/
│   │   ├── dinesh-api/
│   │   │   └── route.ts          # API endpoint
│   │   └── sarla-api/
│   │       └── route.ts          # Reference implementation
│   ├── lib/
│   │   ├── dinesh-utils.ts       # Client utility file
│   │   └── sarla-utils.ts        # Reference implementation
│   └── dashboard/
│       └── page.tsx              # Dashboard with client detection
├── data/
│   └── dinesh_qtf_only_mastersheet.csv  # Source data (optional)
└── docs/
    └── adding-frozen-scheme-guide.md    # This guide
```

---

## Verification Checklist

### Before Deployment

- [ ] **Build passes**: Run `npm run build` successfully
- [ ] **All READ-ONLY**: No database write operations
- [ ] **Correct system tag**: Using `*Zerodha Total Portfolio` for NAV/returns
- [ ] **Cash flows from correct tag**: Using `*Zerodha Total Portfolio` for capital events
- [ ] **Equity curve points match**: Count should match trading days
- [ ] **MDD is correct**: Cross-check with source data
- [ ] **Return calculation verified**: Manual calculation matches code

### After Deployment

- [ ] **Dropdown shows scheme**: "Scheme QTF (Inactive)"
- [ ] **Stats cards correct**: Return, profit, MDD values
- [ ] **Equity curve renders**: All data points visible
- [ ] **P&L tables populate**: Monthly and quarterly data
- [ ] **Cash flows display**: Initial deposit and final withdrawal
- [ ] **No console errors**: Check browser dev tools

---

## Common Patterns

### Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| Utility file | `{client}-utils.ts` | `dinesh-utils.ts` |
| API route | `{client}-api/route.ts` | `dinesh-api/route.ts` |
| Account code | `AC{N}` | `AC9` |
| System tag (NAV) | `{Scheme} Zerodha Total Portfolio` | `QTF Zerodha Total Portfolio` |
| System tag (daily) | `{Scheme} Total Portfolio Value` | `QTF Total Portfolio Value` |

### Scheme Configuration

```typescript
"Scheme Name": {
  current: "System Tag for NAV",
  metrics: "System Tag for Metrics",
  nav: "System Tag for NAV",
  isActive: false,  // true for live schemes
}
```

### Client Detection Pattern

```typescript
const isClientX = session?.user?.icode === "QUS000XX";
```

### Hardcoded Data Structure

```typescript
{
  data: {
    amountDeposited: "0.00",     // Always "0.00" for frozen
    currentExposure: "0.00",     // Always "0.00" for frozen
    return: "13.95",             // Since inception return %
    totalProfit: "6805437.30",   // Total profit (absolute)
    trailingReturns: { ... },
    drawdown: "-0.07",           // Current drawdown
    maxDrawdown: "-2.53",        // Maximum drawdown
    equityCurve: [ ... ],        // All NAV data points
    drawdownCurve: [ ... ],      // All drawdown data points
    quarterlyPnl: { ... },
    monthlyPnl: { ... },
    cashFlows: [ ... ],          // Deposits and withdrawals
    strategyName: "Scheme QTF",
  },
  metadata: {
    icode: "Scheme QTF",
    accountCount: 1,
    lastUpdated: "2026-01-09T00:00:00.000Z",
    inceptionDate: "2025-08-26",
    dataAsOfDate: "2026-01-09",
    strategyName: "Scheme QTF",
    isActive: false,
  },
}
```

---

## Troubleshooting

### Common Issues

1. **Wrong return value**
   - Verify using `*Zerodha Total Portfolio` tag, not `*Total Portfolio Value`
   - Check first and last NAV values in equity curve

2. **Missing data points**
   - Count trading days vs data points
   - Check for holidays/weekends in source data

3. **Build fails**
   - Check TypeScript interfaces match data structure
   - Verify all required fields are present

4. **Scheme not showing in dropdown**
   - Check `PORTFOLIO_MAPPING` has correct account code
   - Verify client detection logic in dashboard

---

## Adding Phase 2: Live Schemes

When ready to add active schemes (like QAW++) to the same client:

1. Add new scheme to `PORTFOLIO_MAPPING` with `isActive: true`
2. Implement live data fetching (not hardcoded)
3. Add Total Portfolio aggregation logic
4. Follow patterns in `sarla-utils.ts` for multi-scheme handling

---

## References

- `app/lib/sarla-utils.ts` - Reference implementation for Sarla/Satidham
- `app/lib/portfolio-utils.ts` - Strategy pattern for regular accounts
- `CLAUDE.md` - Project conventions and patterns
