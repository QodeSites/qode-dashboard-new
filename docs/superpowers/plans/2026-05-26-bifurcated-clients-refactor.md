# Bifurcated Clients Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the 3 bifurcated_master_sheet_test clients (Dinesh, Arwani, Ashwin) from per-client API routes to a registry-driven parameterized API. Reduce future "add a new client" work from ~270 lines/5 files/5 commits down to ~25 lines/2 files/1 commit. Shilpa/Vikram untouched.

**Architecture:** Strangler-fig in three phases — (A) additive: build registry + helper + parameterized routes alongside existing per-client routes; (B) repoint dashboard + holding-summary to new routes; (C) delete old per-client URL routes (keep `*Api` shims for distributor-utils). Each commit is independently reversible. After phase A, both old and new URLs must return byte-identical JSON.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Prisma (PostgreSQL), NextAuth.js.

**Spec:** `docs/superpowers/specs/2026-05-26-bifurcated-clients-refactor-design.md`

**Database safety:** All new code is READ-ONLY per CLAUDE.md. Only `findFirst`/`findMany`/`count`/`aggregate` are introduced; zero `create`/`update`/`delete`/`upsert`/`$executeRaw`.

**Testing note:** This code path has no automated test suite. Each task uses `npm run build` as the type-safety gate and uses curl/Studio-driven manual checks as the behavior gate. The strangler-fig design provides a strong regression contract: after phase A, hitting both `/api/dinesh-api?qcode=QAC00053` and `/api/bifurcated-portfolio?qcode=QAC00053` must return byte-identical JSON.

---

## Phase A — Additive build (Tasks 1–13)

Old per-client routes remain live throughout this phase. Each task lands as its own commit; reverting any commit restores the prior working state.

### Task 1: Add `defineBifurcatedClient` helper + export types

**Files:**
- Modify: `app/lib/bifurcated-portfolio-utils.ts`

This task adds the helper plus exports `ClientConfig` and `PortfolioConfig` (currently file-private), which subsequent tasks need to import from per-client files.

- [ ] **Step 1: Export `ClientConfig` and `PortfolioConfig` interfaces**

Read `app/lib/bifurcated-portfolio-utils.ts` lines 80–125 to confirm the current shape, then use `Edit` to add `export` keywords.

`old_string`:
```ts
interface PortfolioConfig {
```
`new_string`:
```ts
export interface PortfolioConfig {
```

Then:

`old_string`:
```ts
interface ClientConfig {
```
`new_string`:
```ts
export interface ClientConfig {
```

- [ ] **Step 2: Add `defineBifurcatedClient` helper after the `ClientConfig` interface**

`old_string` (the closing of `ClientConfig` interface + the section divider):
```ts
  portfolioMapping: Record<string, PortfolioConfig>;
}

// ==================== Client Configurations ====================
```

`new_string`:
```ts
  portfolioMapping: Record<string, PortfolioConfig>;
}

// ==================== Helper: defineBifurcatedClient ====================
// Builder for the Arwani/Ashwin "multi-parallel-active-schemes" pattern.
// Input vocabulary mirrors the data team's tag spec (profit / exposure /
// inceptionDate). The helper synthesizes the verbose ClientConfig with all
// sentinel fields filled in. Use for new bifurcated_master_sheet_test clients
// that have no inactive scheme and use "Qode Total Portfolio" as the aggregate.
// For clients with inactive schemes (e.g. Dinesh's QTF) use the verbose
// ClientConfig directly.

export interface DefineBifurcatedClientInput {
  name: string;
  qcode: string;
  schemes: Record<
    string,
    {
      inceptionDate: string; // YYYY-MM-DD
      exposure: string;      // system_tag for current/metrics (the "exposure" tag)
      profit: string;        // system_tag for nav (the "profit" tag)
    }
  >;
  // Optional overrides — rarely needed.
  qodeTotalPortfolioTag?: string; // default: "Qode Total Portfolio"
  accountCode?: string;            // default: "" (field is vestigial here)
}

export function defineBifurcatedClient(
  input: DefineBifurcatedClientInput
): ClientConfig {
  const schemeNames = Object.keys(input.schemes);
  if (schemeNames.length === 0) {
    throw new Error(
      `defineBifurcatedClient: ${input.name} declares no schemes`
    );
  }
  const firstSchemeName = schemeNames[0];
  const firstScheme = input.schemes[firstSchemeName];

  const portfolioMapping: Record<string, PortfolioConfig> = {
    "Total Portfolio": {
      current: "Total Portfolio",
      metrics: "Total Portfolio",
      nav: "Total Portfolio",
      isActive: true,
    },
  };
  for (const [schemeName, scheme] of Object.entries(input.schemes)) {
    portfolioMapping[schemeName] = {
      current: scheme.exposure,
      metrics: scheme.exposure,
      nav: scheme.profit,
      isActive: true,
      tags: {
        depositTag: scheme.exposure,
        navTag: scheme.profit,
        startDate: new Date(scheme.inceptionDate),
      },
    };
  }

  return {
    clientName: input.name,
    defaultQcode: input.qcode,
    accountCode: input.accountCode ?? "",
    oldSchemeName: "__no_old_scheme__",
    newSchemeName: firstSchemeName,
    oldFinalNav: 100,
    newStartDate: new Date(firstScheme.inceptionDate),
    depositSystemTag: firstScheme.exposure,
    navSystemTag: firstScheme.exposure,
    oldSchemeDepositTag: "__no_old_deposit_tag__",
    oldSchemeNavTag: "__no_old_nav_tag__",
    qodeTotalPortfolioTag:
      input.qodeTotalPortfolioTag ?? "Qode Total Portfolio",
    portfolioMapping,
  };
}

// ==================== Client Configurations ====================
```

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: exit 0. The helper is unused at this point; TypeScript will accept it as long as the body type-checks.

- [ ] **Step 4: Commit**

```bash
git add app/lib/bifurcated-portfolio-utils.ts
git commit -m "feat(bifurcated): add defineBifurcatedClient helper + export ClientConfig/PortfolioConfig"
```

---

### Task 2: Extract `DINESH_CONFIG` to `app/lib/clients/dinesh.ts`

**Files:**
- Create: `app/lib/clients/dinesh.ts`
- Modify: `app/lib/bifurcated-portfolio-utils.ts`

Dinesh keeps the verbose `ClientConfig` shape because of the inactive QTF scheme and `displayAmountInvestedAsZero` flag. The helper doesn't model these.

- [ ] **Step 1: Create the new client file**

Use `Write` to create `app/lib/clients/dinesh.ts`:

```ts
import type { ClientConfig } from "../bifurcated-portfolio-utils";

// Dinesh has an inactive QTF scheme migrated to live DB queries (sourced from
// bifurcated_master_sheet_test under "QTF Zerodha Total Portfolio"). The
// engine's frozen-scheme branches never fire because oldSchemeName is a
// sentinel that doesn't match any portfolioMapping key.
export const DINESH_CONFIG: ClientConfig = {
  clientName: "Dinesh",
  defaultQcode: "QAC00053",
  accountCode: "AC9",
  oldSchemeName: "__no_old_scheme__",
  newSchemeName: "Scheme QAW++",
  oldFinalNav: 100,
  newStartDate: new Date("2026-01-12"),
  depositSystemTag: "Zerodha Total Portfolio",
  navSystemTag: "Zerodha Total Portfolio",
  oldSchemeDepositTag: "__no_old_deposit_tag__",
  oldSchemeNavTag: "__no_old_nav_tag__",
  qodeTotalPortfolioTag: "Qode Total Portfolio",
  portfolioMapping: {
    "Total Portfolio": {
      current: "Total Portfolio",
      metrics: "Total Portfolio",
      nav: "Total Portfolio",
      isActive: true,
    },
    "Scheme QAW++": {
      current: "QAW++ Zerodha Total Portfolio",
      metrics: "QAW++ Zerodha Total Portfolio",
      nav: "QAW++ Zerodha Total Portfolio",
      isActive: true,
      tags: {
        depositTag: "QAW++ Zerodha Total Portfolio",
        navTag: "QAW++ Zerodha Total Portfolio",
        startDate: new Date("2026-01-12"),
      },
    },
    "Scheme QYE++": {
      current: "QYE++ Zerodha Total Portfolio",
      metrics: "QYE++ Zerodha Total Portfolio",
      nav: "QYE++ Total Portfolio Value",
      isActive: true,
      tags: {
        depositTag: "QYE++ Zerodha Total Portfolio",
        navTag: "QYE++ Total Portfolio Value",
        startDate: new Date("2026-04-08"),
      },
    },
    "Scheme QTF": {
      current: "QTF Zerodha Total Portfolio",
      metrics: "QTF Zerodha Total Portfolio",
      nav: "QTF Zerodha Total Portfolio",
      isActive: false,
      tags: {
        depositTag: "QTF Zerodha Total Portfolio",
        navTag: "QTF Zerodha Total Portfolio",
        startDate: new Date("2025-08-26"),
      },
      // Net cash flow on QTF is negative (closing withdrawal of ~₹5.68 Cr
      // exceeded the ~₹4.99 Cr seed because the withdrawal moved the grown
      // portfolio out to QAW++). Team prefers to show 0 on the inactive
      // card rather than expose this accounting artifact.
      displayAmountInvestedAsZero: true,
    },
  },
};
```

- [ ] **Step 2a: Add the per-client config import near the top of the file**

Use `Edit` to insert the import block immediately before the helper section.

`old_string`:
```ts
// ==================== Helper: defineBifurcatedClient ====================
```

`new_string`:
```ts
// ==================== Per-Client Config Imports ====================

import { DINESH_CONFIG } from "./clients/dinesh";

// ==================== Helper: defineBifurcatedClient ====================
```

- [ ] **Step 2b: Remove the inline `DINESH_CONFIG` block**

Use `Edit`.

`old_string` (the entire block from line ~129 to ~194 — copy verbatim from the source file):
```ts
const DINESH_CONFIG: ClientConfig = {
  clientName: "Dinesh",
  defaultQcode: "QAC00053",
  accountCode: "AC9",
  // QTF was migrated from frozen-data-file to live DB queries (sourced from
  // bifurcated_master_sheet_test under "QTF Zerodha Total Portfolio"). The
  // engine's frozen-scheme branches now never fire for Dinesh because
  // oldSchemeName is a sentinel that doesn't match any portfolioMapping key.
  oldSchemeName: "__no_old_scheme__",
  newSchemeName: "Scheme QAW++",
  oldFinalNav: 100,
  newStartDate: new Date("2026-01-12"),
  depositSystemTag: "Zerodha Total Portfolio",
  navSystemTag: "Zerodha Total Portfolio",
  // Sentinels different from depositSystemTag/navSystemTag — irrelevant after
  // QTF migration but kept consistent with Arwani's pattern.
  oldSchemeDepositTag: "__no_old_deposit_tag__",
  oldSchemeNavTag: "__no_old_nav_tag__",
  qodeTotalPortfolioTag: "Qode Total Portfolio",
  portfolioMapping: {
    "Total Portfolio": {
      current: "Total Portfolio",
      metrics: "Total Portfolio",
      nav: "Total Portfolio",
      isActive: true,
    },
    "Scheme QAW++": {
      current: "QAW++ Zerodha Total Portfolio",
      metrics: "QAW++ Zerodha Total Portfolio",
      nav: "QAW++ Zerodha Total Portfolio",
      isActive: true,
      tags: {
        depositTag: "QAW++ Zerodha Total Portfolio",
        navTag: "QAW++ Zerodha Total Portfolio",
        startDate: new Date("2026-01-12"),
      },
    },
    "Scheme QYE++": {
      current: "QYE++ Zerodha Total Portfolio",
      metrics: "QYE++ Zerodha Total Portfolio",
      nav: "QYE++ Total Portfolio Value",
      isActive: true,
      tags: {
        depositTag: "QYE++ Zerodha Total Portfolio",
        navTag: "QYE++ Total Portfolio Value",
        startDate: new Date("2026-04-08"),
      },
    },
    "Scheme QTF": {
      current: "QTF Zerodha Total Portfolio",
      metrics: "QTF Zerodha Total Portfolio",
      nav: "QTF Zerodha Total Portfolio",
      isActive: false,
      tags: {
        depositTag: "QTF Zerodha Total Portfolio",
        navTag: "QTF Zerodha Total Portfolio",
        startDate: new Date("2025-08-26"),
      },
      // Net cash flow on QTF is negative (closing withdrawal of ~₹5.68 Cr
      // exceeded the ~₹4.99 Cr seed because the withdrawal moved the grown
      // portfolio out to QAW++). Team prefers to show 0 on the inactive
      // card rather than expose this accounting artifact.
      displayAmountInvestedAsZero: true,
    },
  },
};

```

`new_string`: (empty string — removes the block; the trailing blank line is intentional)
```ts

```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0. The `dineshEngine` declaration further down the file (line ~1622) still references `DINESH_CONFIG` — now resolved via the import.

- [ ] **Step 4: Commit**

```bash
git add app/lib/clients/dinesh.ts app/lib/bifurcated-portfolio-utils.ts
git commit -m "refactor(bifurcated): extract DINESH_CONFIG to app/lib/clients/dinesh.ts"
```

---

### Task 3: Extract `SHILPA_CONFIG` and `VIKRAM_CONFIG`

**Files:**
- Create: `app/lib/clients/shilpa.ts`
- Create: `app/lib/clients/vikram.ts`
- Modify: `app/lib/bifurcated-portfolio-utils.ts`

These clients use the legacy engine path (no `qodeTotalPortfolioTag`); their configs stay verbose. They move purely for file-organization consistency.

- [ ] **Step 1: Create `app/lib/clients/shilpa.ts`**

```ts
import type { ClientConfig } from "../bifurcated-portfolio-utils";

export const SHILPA_CONFIG: ClientConfig = {
  clientName: "Shilpa",
  defaultQcode: "QAC00040",
  accountCode: "AC10",
  oldSchemeName: "Scheme QYE+",
  newSchemeName: "Scheme QYE++",
  oldFinalNav: 110.43,
  newStartDate: new Date("2026-02-05"),
  depositSystemTag: "Zerodha Total Portfolio",
  navSystemTag: "Total Portfolio Value",
  oldSchemeDepositTag: "Zerodha Total Portfolio",
  oldSchemeNavTag: "Total Portfolio Value",
  portfolioMapping: {
    "Total Portfolio": {
      current: "Total Portfolio",
      metrics: "Total Portfolio",
      nav: "Total Portfolio",
      isActive: true,
    },
    "Scheme QYE++": {
      current: "Total Portfolio Value",
      metrics: "Total Portfolio Value",
      nav: "Total Portfolio Value",
      isActive: true,
    },
    "Scheme QYE+": {
      current: "Total Portfolio Value",
      metrics: "Total Portfolio Value",
      nav: "Total Portfolio Value",
      isActive: false,
    },
  },
};
```

- [ ] **Step 2: Create `app/lib/clients/vikram.ts`**

```ts
import type { ClientConfig } from "../bifurcated-portfolio-utils";

export const VIKRAM_CONFIG: ClientConfig = {
  clientName: "Vikram Trading",
  defaultQcode: "QAC00043",
  accountCode: "AC11",
  oldSchemeName: "Scheme QYE+",
  newSchemeName: "Scheme QYE++",
  oldFinalNav: 106.02,
  newStartDate: new Date("2026-01-14"),
  depositSystemTag: "Zerodha Total Portfolio",
  navSystemTag: "Total Portfolio Value",
  oldSchemeDepositTag: "Zerodha Total Portfolio",
  oldSchemeNavTag: "Total Portfolio Value",
  portfolioMapping: {
    "Total Portfolio": {
      current: "Total Portfolio",
      metrics: "Total Portfolio",
      nav: "Total Portfolio",
      isActive: true,
    },
    "Scheme QYE++": {
      current: "Total Portfolio Value",
      metrics: "Total Portfolio Value",
      nav: "Total Portfolio Value",
      isActive: true,
    },
    "Scheme QYE+": {
      current: "Total Portfolio Value",
      metrics: "Total Portfolio Value",
      nav: "Total Portfolio Value",
      isActive: false,
    },
  },
};
```

- [ ] **Step 3: Update the import block in `bifurcated-portfolio-utils.ts`**

Use `Edit`. `old_string`:
```ts
// ==================== Per-Client Config Imports ====================

import { DINESH_CONFIG } from "./clients/dinesh";

// ==================== Helper: defineBifurcatedClient ====================
```

`new_string`:
```ts
// ==================== Per-Client Config Imports ====================

import { DINESH_CONFIG } from "./clients/dinesh";
import { SHILPA_CONFIG } from "./clients/shilpa";
import { VIKRAM_CONFIG } from "./clients/vikram";

// ==================== Helper: defineBifurcatedClient ====================
```

- [ ] **Step 4: Remove the inline `SHILPA_CONFIG` block**

Use `Edit`. `old_string` (the full block from the existing file):
```ts
const SHILPA_CONFIG: ClientConfig = {
  clientName: "Shilpa",
  defaultQcode: "QAC00040",
  accountCode: "AC10",
  oldSchemeName: "Scheme QYE+",
  newSchemeName: "Scheme QYE++",
  oldFinalNav: 110.43,
  newStartDate: new Date("2026-02-05"),
  depositSystemTag: "Zerodha Total Portfolio",
  navSystemTag: "Total Portfolio Value",
  oldSchemeDepositTag: "Zerodha Total Portfolio",
  oldSchemeNavTag: "Total Portfolio Value",
  portfolioMapping: {
    "Total Portfolio": {
      current: "Total Portfolio",
      metrics: "Total Portfolio",
      nav: "Total Portfolio",
      isActive: true,
    },
    "Scheme QYE++": {
      current: "Total Portfolio Value",
      metrics: "Total Portfolio Value",
      nav: "Total Portfolio Value",
      isActive: true,
    },
    "Scheme QYE+": {
      current: "Total Portfolio Value",
      metrics: "Total Portfolio Value",
      nav: "Total Portfolio Value",
      isActive: false,
    },
  },
};

```

`new_string`: empty (one blank line, like in Task 2).

- [ ] **Step 5: Remove the inline `VIKRAM_CONFIG` block**

Use `Edit`. `old_string` (the full block from the existing file):
```ts
const VIKRAM_CONFIG: ClientConfig = {
  clientName: "Vikram Trading",
  defaultQcode: "QAC00043",
  accountCode: "AC11",
  oldSchemeName: "Scheme QYE+",
  newSchemeName: "Scheme QYE++",
  oldFinalNav: 106.02,
  newStartDate: new Date("2026-01-14"),
  depositSystemTag: "Zerodha Total Portfolio",
  navSystemTag: "Total Portfolio Value",
  oldSchemeDepositTag: "Zerodha Total Portfolio",
  oldSchemeNavTag: "Total Portfolio Value",
  portfolioMapping: {
    "Total Portfolio": {
      current: "Total Portfolio",
      metrics: "Total Portfolio",
      nav: "Total Portfolio",
      isActive: true,
    },
    "Scheme QYE++": {
      current: "Total Portfolio Value",
      metrics: "Total Portfolio Value",
      nav: "Total Portfolio Value",
      isActive: true,
    },
    "Scheme QYE+": {
      current: "Total Portfolio Value",
      metrics: "Total Portfolio Value",
      nav: "Total Portfolio Value",
      isActive: false,
    },
  },
};

```

`new_string`: empty.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: exit 0. The `shilpaEngine` and `vikramEngine` declarations still resolve via the new imports.

- [ ] **Step 7: Commit**

```bash
git add app/lib/clients/shilpa.ts app/lib/clients/vikram.ts app/lib/bifurcated-portfolio-utils.ts
git commit -m "refactor(bifurcated): extract SHILPA_CONFIG and VIKRAM_CONFIG to app/lib/clients/"
```

---

### Task 4: Migrate `ARWANI_CONFIG` to the helper

**Files:**
- Create: `app/lib/clients/arwani.ts`
- Modify: `app/lib/bifurcated-portfolio-utils.ts`

This is the first config using `defineBifurcatedClient`. The output of the helper must be **behaviorally identical** to the existing verbose `ARWANI_CONFIG` — the build-time check is "engine returns same JSON before vs. after," verified explicitly in Task 14.

- [ ] **Step 1: Create `app/lib/clients/arwani.ts`**

```ts
import { defineBifurcatedClient } from "../bifurcated-portfolio-utils";

// Arwani: two parallel active schemes (QYE++ since 2026-01-16, QAW++ since
// 2026-03-23) and an authoritative Qode Total Portfolio aggregate curve.
// No inactive scheme.
export const ARWANI_CONFIG = defineBifurcatedClient({
  name: "Arwani",
  qcode: "QAC00071",
  accountCode: "AC12",
  schemes: {
    "Scheme QYE++": {
      inceptionDate: "2026-01-16",
      exposure: "QYE++ Zerodha Total Portfolio",
      profit:   "QYE++ Total Portfolio Value",
    },
    "Scheme QAW++": {
      inceptionDate: "2026-03-23",
      exposure: "QAW++ Zerodha Total Portfolio",
      profit:   "QAW++ Zerodha Total Portfolio",
    },
  },
});
```

- [ ] **Step 2: Add the import to `bifurcated-portfolio-utils.ts`**

Use `Edit`. `old_string`:
```ts
import { DINESH_CONFIG } from "./clients/dinesh";
import { SHILPA_CONFIG } from "./clients/shilpa";
import { VIKRAM_CONFIG } from "./clients/vikram";
```

`new_string`:
```ts
import { DINESH_CONFIG } from "./clients/dinesh";
import { SHILPA_CONFIG } from "./clients/shilpa";
import { VIKRAM_CONFIG } from "./clients/vikram";
import { ARWANI_CONFIG } from "./clients/arwani";
```

- [ ] **Step 3: Remove the inline `ARWANI_CONFIG` block**

Use `Edit`. `old_string` (the full block):
```ts
// Arwani has no inactive scheme — two parallel active schemes (QYE++ since
// inception 2026-01-16, QAW++ added 2026-03-23) and a Qode Total Portfolio
// authoritative aggregate. The "old scheme" config fields are sentinels that
// never match a portfolioMapping key, so the engine's frozen-scheme branches
// stay dormant. EMPTY_FROZEN_DATA satisfies the engine's frozenData reads
// during Total Portfolio aggregation as no-ops.
const ARWANI_CONFIG: ClientConfig = {
  clientName: "Arwani",
  defaultQcode: "QAC00071",
  accountCode: "AC12",
  oldSchemeName: "__no_old_scheme__",
  newSchemeName: "Scheme QYE++",
  oldFinalNav: 100,
  newStartDate: new Date("2026-01-16"),
  depositSystemTag: "QYE++ Zerodha Total Portfolio",
  navSystemTag: "QYE++ Zerodha Total Portfolio",
  // Sentinels different from depositSystemTag/navSystemTag — forces
  // sharedDepositTag/sharedNavTag = false, which gives QYE++ a date-filtered
  // query and a NAV=100 inception baseline (correct for Arwani).
  oldSchemeDepositTag: "__no_old_deposit_tag__",
  oldSchemeNavTag: "__no_old_nav_tag__",
  qodeTotalPortfolioTag: "Qode Total Portfolio",
  portfolioMapping: {
    "Total Portfolio": {
      current: "Total Portfolio",
      metrics: "Total Portfolio",
      nav: "Total Portfolio",
      isActive: true,
    },
    "Scheme QYE++": {
      current: "QYE++ Zerodha Total Portfolio",
      metrics: "QYE++ Zerodha Total Portfolio",
      nav: "QYE++ Total Portfolio Value",
      isActive: true,
      tags: {
        depositTag: "QYE++ Zerodha Total Portfolio",
        navTag: "QYE++ Total Portfolio Value",
        startDate: new Date("2026-01-16"),
      },
    },
    "Scheme QAW++": {
      current: "QAW++ Zerodha Total Portfolio",
      metrics: "QAW++ Zerodha Total Portfolio",
      nav: "QAW++ Zerodha Total Portfolio",
      isActive: true,
      tags: {
        depositTag: "QAW++ Zerodha Total Portfolio",
        navTag: "QAW++ Zerodha Total Portfolio",
        startDate: new Date("2026-03-23"),
      },
    },
  },
};

```

`new_string`: empty.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/lib/clients/arwani.ts app/lib/bifurcated-portfolio-utils.ts
git commit -m "refactor(bifurcated): migrate ARWANI_CONFIG to defineBifurcatedClient helper"
```

---

### Task 5: Migrate `ASHWIN_CONFIG` to the helper

**Files:**
- Create: `app/lib/clients/ashwin.ts`
- Modify: `app/lib/bifurcated-portfolio-utils.ts`

Same pattern as Task 4 with Ashwin's values.

- [ ] **Step 1: Create `app/lib/clients/ashwin.ts`**

```ts
import { defineBifurcatedClient } from "../bifurcated-portfolio-utils";

// Ashwin Agarwal: two parallel active schemes (QYE++ since 2026-02-24,
// QAW++ added 2026-05-04) and an authoritative Qode Total Portfolio
// aggregate curve. No inactive scheme.
export const ASHWIN_CONFIG = defineBifurcatedClient({
  name: "Ashwin Agarwal",
  qcode: "QAC00083",
  accountCode: "AC13",
  schemes: {
    "Scheme QYE++": {
      inceptionDate: "2026-02-24",
      exposure: "QYE++ Zerodha Total Portfolio",
      profit:   "QYE++ Total Portfolio Value",
    },
    "Scheme QAW++": {
      inceptionDate: "2026-05-04",
      exposure: "QAW++ Zerodha Total Portfolio",
      profit:   "QAW++ Zerodha Total Portfolio",
    },
  },
});
```

- [ ] **Step 2: Add the import**

Use `Edit`. `old_string`:
```ts
import { ARWANI_CONFIG } from "./clients/arwani";
```

`new_string`:
```ts
import { ARWANI_CONFIG } from "./clients/arwani";
import { ASHWIN_CONFIG } from "./clients/ashwin";
```

- [ ] **Step 3: Remove the inline `ASHWIN_CONFIG` block**

Use `Edit`. `old_string` (the full block, including the leading comment):
```ts
// Ashwin Agarwal: identical shape to Arwani — two parallel active schemes
// (QYE++ since 2026-02-24, QAW++ added 2026-05-04) and an authoritative
// Qode Total Portfolio aggregate curve. No inactive scheme.
const ASHWIN_CONFIG: ClientConfig = {
  clientName: "Ashwin Agarwal",
  defaultQcode: "QAC00083",
  accountCode: "AC13",
  oldSchemeName: "__no_old_scheme__",
  newSchemeName: "Scheme QYE++",
  oldFinalNav: 100,
  newStartDate: new Date("2026-02-24"),
  depositSystemTag: "QYE++ Zerodha Total Portfolio",
  navSystemTag: "QYE++ Zerodha Total Portfolio",
  oldSchemeDepositTag: "__no_old_deposit_tag__",
  oldSchemeNavTag: "__no_old_nav_tag__",
  qodeTotalPortfolioTag: "Qode Total Portfolio",
  portfolioMapping: {
    "Total Portfolio": {
      current: "Total Portfolio",
      metrics: "Total Portfolio",
      nav: "Total Portfolio",
      isActive: true,
    },
    "Scheme QYE++": {
      current: "QYE++ Zerodha Total Portfolio",
      metrics: "QYE++ Zerodha Total Portfolio",
      nav: "QYE++ Total Portfolio Value",
      isActive: true,
      tags: {
        depositTag: "QYE++ Zerodha Total Portfolio",
        navTag: "QYE++ Total Portfolio Value",
        startDate: new Date("2026-02-24"),
      },
    },
    "Scheme QAW++": {
      current: "QAW++ Zerodha Total Portfolio",
      metrics: "QAW++ Zerodha Total Portfolio",
      nav: "QAW++ Zerodha Total Portfolio",
      isActive: true,
      tags: {
        depositTag: "QAW++ Zerodha Total Portfolio",
        navTag: "QAW++ Zerodha Total Portfolio",
        startDate: new Date("2026-05-04"),
      },
    },
  },
};

```

`new_string`: empty.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/lib/clients/ashwin.ts app/lib/bifurcated-portfolio-utils.ts
git commit -m "refactor(bifurcated): migrate ASHWIN_CONFIG to defineBifurcatedClient helper"
```

---

### Task 6: Create the bifurcated clients registry

**Files:**
- Create: `app/lib/bifurcated-clients-registry.ts`

- [ ] **Step 1: Create the file**

Use `Write` for `app/lib/bifurcated-clients-registry.ts`:

```ts
import type {
  ClientConfig,
  FrozenSchemeData,
} from "./bifurcated-portfolio-utils";
import { DINESH_CONFIG } from "./clients/dinesh";
import { ARWANI_CONFIG } from "./clients/arwani";
import { ASHWIN_CONFIG } from "./clients/ashwin";
import {
  DINESH_FROZEN_DATA,
  EMPTY_FROZEN_DATA,
} from "./bifurcated-portfolio-data";

// Single source of truth for clients whose data lives in
// bifurcated_master_sheet_test. Add a new entry here when onboarding a new
// bifurcated client (see docs/how-to-add-a-bifurcated-client.md).
//
// Shilpa and Vikram intentionally NOT in this registry — they still read from
// master_sheet via their own engine instances. They will be added here once
// their data migrates to bifurcated_master_sheet_test.

export interface BifurcatedClientEntry {
  icode: string;
  qcode: string;
  displayName: string;
  config: ClientConfig;
  frozenData: FrozenSchemeData;
  hasNavBasedTotalPortfolio: boolean;
}

export const BIFURCATED_CLIENTS: BifurcatedClientEntry[] = [
  {
    icode: "QUS00072",
    qcode: "QAC00053",
    displayName: "Dinesh",
    config: DINESH_CONFIG,
    frozenData: DINESH_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },
  {
    icode: "QUS00085",
    qcode: "QAC00071",
    displayName: "Arwani",
    config: ARWANI_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },
  {
    icode: "QUS00097",
    qcode: "QAC00083",
    displayName: "Ashwin Agarwal",
    config: ASHWIN_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },
];

export function findByIcode(icode: string): BifurcatedClientEntry | undefined {
  return BIFURCATED_CLIENTS.find((c) => c.icode === icode);
}

export function findByQcode(qcode: string): BifurcatedClientEntry | undefined {
  return BIFURCATED_CLIENTS.find((c) => c.qcode === qcode);
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0. Registry exists but is unused so far; this is fine.

- [ ] **Step 3: Commit**

```bash
git add app/lib/bifurcated-clients-registry.ts
git commit -m "feat(bifurcated): add registry of bifurcated_master_sheet_test clients"
```

---

### Task 7: Replace inline engine constants with registry-driven `engineByQcode` map

**Files:**
- Modify: `app/lib/bifurcated-portfolio-utils.ts`

This is the most invasive task in Phase A. It replaces the per-client engine constants (`dineshEngine`, `arwaniEngine`, `ashwinEngine`) with a map built from the registry, keeps `shilpaEngine` and `vikramEngine` as standalone instances (they're not in the registry), and rewires the `*Api` shim exports to delegate via the map for the 3 registered clients.

- [ ] **Step 1: Read the current engine + export block**

Read `app/lib/bifurcated-portfolio-utils.ts` from line ~1608 to the end of file to confirm exact text of the engine constants and `*Api` exports.

- [ ] **Step 2: Replace the engine constants and exports**

Use `Edit`. `old_string` (the full engine instance + export block at end of file):
```ts
const dineshEngine = new BifurcatedPortfolioEngine(
  DINESH_CONFIG,
  DINESH_FROZEN_DATA
);
const shilpaEngine = new BifurcatedPortfolioEngine(
  SHILPA_CONFIG,
  SHILPA_FROZEN_DATA
);
const vikramEngine = new BifurcatedPortfolioEngine(
  VIKRAM_CONFIG,
  VIKRAM_FROZEN_DATA
);
const arwaniEngine = new BifurcatedPortfolioEngine(
  ARWANI_CONFIG,
  EMPTY_FROZEN_DATA
);
const ashwinEngine = new BifurcatedPortfolioEngine(
  ASHWIN_CONFIG,
  EMPTY_FROZEN_DATA
);

export const DineshApi = {
  GET: (req: Request) => dineshEngine.handleGET(req),
};
export const ShilpaApi = {
  GET: (req: Request) => shilpaEngine.handleGET(req),
};
export const VikramApi = {
  GET: (req: Request) => vikramEngine.handleGET(req),
};
export const ArwaniApi = {
  GET: (req: Request) => arwaniEngine.handleGET(req),
};
export const AshwinApi = {
  GET: (req: Request) => ashwinEngine.handleGET(req),
};
```

`new_string`:
```ts
import { BIFURCATED_CLIENTS } from "./bifurcated-clients-registry";

// Registry-driven engine cache. One instance per registered bifurcated client
// (Dinesh, Arwani, Ashwin). Constructed once at module load.
const engineByQcode: Map<string, BifurcatedPortfolioEngine> = new Map(
  BIFURCATED_CLIENTS.map((c) => [
    c.qcode,
    new BifurcatedPortfolioEngine(c.config, c.frozenData),
  ])
);

export function getEngineForQcode(
  qcode: string
): BifurcatedPortfolioEngine | null {
  return engineByQcode.get(qcode) ?? null;
}

// Shilpa and Vikram are NOT in the registry (they still read from master_sheet,
// not bifurcated_master_sheet_test). Their engines stay standalone.
const shilpaEngine = new BifurcatedPortfolioEngine(
  SHILPA_CONFIG,
  SHILPA_FROZEN_DATA
);
const vikramEngine = new BifurcatedPortfolioEngine(
  VIKRAM_CONFIG,
  VIKRAM_FROZEN_DATA
);

// Backward-compat shim exports. distributor-utils.ts:795 still calls
// DineshApi.GET(fakeReq); these shims delegate to the registry-driven map for
// the 3 registered clients, and to the standalone engines for Shilpa/Vikram.
// Removable once all callers migrate to /api/bifurcated-portfolio.
export const DineshApi = {
  GET: (req: Request) => engineByQcode.get("QAC00053")!.handleGET(req),
};
export const ShilpaApi = {
  GET: (req: Request) => shilpaEngine.handleGET(req),
};
export const VikramApi = {
  GET: (req: Request) => vikramEngine.handleGET(req),
};
export const ArwaniApi = {
  GET: (req: Request) => engineByQcode.get("QAC00071")!.handleGET(req),
};
export const AshwinApi = {
  GET: (req: Request) => engineByQcode.get("QAC00083")!.handleGET(req),
};
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Spot-check the engine cache initializes correctly**

Run:
```bash
node -e "require('next/dist/build/swc').dummy"  # warms TS just to make sure ts-node compiles
npx ts-node -e "import('./app/lib/bifurcated-portfolio-utils').then(m => console.log('engineByQcode size = expecting 3:', Object.keys(m).filter(k => k.endsWith('Api')).length))"
```
Skip if ts-node doesn't import the route module cleanly outside Next's loader; the next.js build itself is the canonical verification. If the build passes, the module loaded.

- [ ] **Step 5: Commit**

```bash
git add app/lib/bifurcated-portfolio-utils.ts
git commit -m "refactor(bifurcated): replace per-client engine constants with registry-driven engineByQcode map"
```

---

### Task 8: Create the shared auth helper

**Files:**
- Create: `app/lib/bifurcated-auth.ts`

- [ ] **Step 1: Create the file**

Use `Write` for `app/lib/bifurcated-auth.ts`:

```ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getEffectiveIcode } from "./admin-utils";
import {
  findByQcode,
  type BifurcatedClientEntry,
} from "./bifurcated-clients-registry";

export type AuthResult =
  | { ok: true; client: BifurcatedClientEntry }
  | { ok: false; response: NextResponse };

// Shared auth+routing for the parameterized bifurcated routes. Reads the
// session's effective icode (supports admin impersonation), reads ?qcode= from
// the URL, validates that the icode owns the qcode per the registry.
export async function authorizeBifurcatedRequest(
  req: Request
): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const effectiveIcode = getEffectiveIcode(session);
  if (!effectiveIcode) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const url = new URL(req.url);
  const qcode = url.searchParams.get("qcode");
  if (!qcode) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Missing qcode" }, { status: 400 }),
    };
  }
  const client = findByQcode(qcode);
  if (!client) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unknown client" },
        { status: 404 }
      ),
    };
  }
  if (client.icode !== effectiveIcode) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, client };
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/lib/bifurcated-auth.ts
git commit -m "feat(bifurcated): add shared auth helper for parameterized routes"
```

---

### Task 9: Create `/api/bifurcated-portfolio` route

**Files:**
- Create: `app/api/bifurcated-portfolio/route.ts`

- [ ] **Step 1: Create the route file**

Use `Write` for `app/api/bifurcated-portfolio/route.ts`:

```ts
import { NextResponse } from "next/server";
import { authorizeBifurcatedRequest } from "@/app/lib/bifurcated-auth";
import { getEngineForQcode } from "@/app/lib/bifurcated-portfolio-utils";

export async function GET(req: Request) {
  const auth = await authorizeBifurcatedRequest(req);
  if (!auth.ok) return auth.response;

  const engine = getEngineForQcode(auth.client.qcode);
  if (!engine) {
    return NextResponse.json(
      { error: "Engine not found for qcode" },
      { status: 500 }
    );
  }

  return engine.handleGET(req);
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0. `/api/bifurcated-portfolio` should appear in the build output as a dynamic route.

- [ ] **Step 3: Commit**

```bash
git add app/api/bifurcated-portfolio/route.ts
git commit -m "feat(bifurcated): add parameterized /api/bifurcated-portfolio route"
```

---

### Task 10: Create `/api/bifurcated-holdings` route

**Files:**
- Create: `app/api/bifurcated-holdings/route.ts`

Structurally mirrors `app/api/ashwin-holdings-api/route.ts` (read it for reference) but reads icode/qcode from `auth.client` instead of hardcoded constants. All Prisma operations stay `findFirst`/`findMany` — strict READ-ONLY per CLAUDE.md.

- [ ] **Step 1: Read `app/api/ashwin-holdings-api/route.ts`**

The full file is the structural template. Note the helper functions (`num`, `processHoldingsSummary`) and the `Holding` / `HoldingsSummary` types.

- [ ] **Step 2: Create the new route**

Use `Write` for `app/api/bifurcated-holdings/route.ts`:

```ts
import { NextResponse } from "next/server";
import { authorizeBifurcatedRequest } from "@/app/lib/bifurcated-auth";
import { prisma } from "@/lib/prisma";

interface Holding {
  symbol: string;
  exchange: string;
  quantity: number;
  avgPrice: number;
  ltp: number;
  buyValue: number;
  valueAsOfToday: number;
  pnlAmount: number;
  percentPnl: number;
  broker: string;
  debtEquity: string;
  subCategory: string;
  date: Date;
  type: "equity" | "mutual_fund";
  isin?: string;
  strategy?: string;
}

interface HoldingsSummary {
  totalBuyValue: number;
  totalCurrentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  holdingsCount: number;
  equityHoldings: Holding[];
  debtHoldings: Holding[];
  mutualFundHoldings: Holding[];
  categoryBreakdown: Record<
    string,
    { buyValue: number; currentValue: number; pnl: number; count: number }
  >;
  brokerBreakdown: Record<
    string,
    { buyValue: number; currentValue: number; pnl: number; count: number }
  >;
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function processHoldingsSummary(holdings: Holding[]): HoldingsSummary {
  const equityHoldings = holdings.filter((h) => h.type === "equity");
  const debtHoldings = holdings.filter(
    (h) => h.debtEquity?.toLowerCase() === "debt"
  );
  const mutualFundHoldings = holdings.filter((h) => h.type === "mutual_fund");

  const totalBuyValue = holdings.reduce((s, h) => s + h.buyValue, 0);
  const totalCurrentValue = holdings.reduce((s, h) => s + h.valueAsOfToday, 0);
  const totalPnl = holdings.reduce((s, h) => s + h.pnlAmount, 0);
  const totalPnlPercent =
    totalBuyValue > 0 ? (totalPnl / totalBuyValue) * 100 : 0;

  const categoryBreakdown: HoldingsSummary["categoryBreakdown"] = {};
  const brokerBreakdown: HoldingsSummary["brokerBreakdown"] = {};
  for (const h of holdings) {
    const cat = h.subCategory || "Uncategorized";
    if (!categoryBreakdown[cat]) {
      categoryBreakdown[cat] = {
        buyValue: 0,
        currentValue: 0,
        pnl: 0,
        count: 0,
      };
    }
    categoryBreakdown[cat].buyValue += h.buyValue;
    categoryBreakdown[cat].currentValue += h.valueAsOfToday;
    categoryBreakdown[cat].pnl += h.pnlAmount;
    categoryBreakdown[cat].count += 1;

    const broker = h.broker || "Unknown";
    if (!brokerBreakdown[broker]) {
      brokerBreakdown[broker] = {
        buyValue: 0,
        currentValue: 0,
        pnl: 0,
        count: 0,
      };
    }
    brokerBreakdown[broker].buyValue += h.buyValue;
    brokerBreakdown[broker].currentValue += h.valueAsOfToday;
    brokerBreakdown[broker].pnl += h.pnlAmount;
    brokerBreakdown[broker].count += 1;
  }

  return {
    totalBuyValue,
    totalCurrentValue,
    totalPnl,
    totalPnlPercent,
    holdingsCount: holdings.length,
    equityHoldings,
    debtHoldings,
    mutualFundHoldings,
    categoryBreakdown,
    brokerBreakdown,
  };
}

export async function GET(req: Request) {
  try {
    const auth = await authorizeBifurcatedRequest(req);
    if (!auth.ok) return auth.response;
    const qcode = auth.client.qcode;

    const latestEquity = await prisma.bifurcated_equity_holding_test.findFirst({
      where: { qcode },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    const latestMf =
      await prisma.bifurcated_mutual_fund_holding_sheet_test.findFirst({
        where: { qcode },
        orderBy: { as_of_date: "desc" },
        select: { as_of_date: true },
      });

    const equityRows = latestEquity
      ? await prisma.bifurcated_equity_holding_test.findMany({
          where: { qcode, date: latestEquity.date },
        })
      : [];
    const mfRows = latestMf
      ? await prisma.bifurcated_mutual_fund_holding_sheet_test.findMany({
          where: { qcode, as_of_date: latestMf.as_of_date },
        })
      : [];

    const equityHoldings: Holding[] = equityRows.map((r) => ({
      symbol: r.symbol ?? "",
      exchange: r.exchange ?? "",
      quantity: num(r.quantity),
      avgPrice: num(r.avg_price),
      ltp: num(r.ltp),
      buyValue: num(r.buy_value),
      valueAsOfToday: num(r.value_as_of_today),
      pnlAmount: num(r.pnl_amount),
      percentPnl: num(r.percent_pnl),
      broker: r.broker ?? "",
      debtEquity: r.debt_equity ?? "",
      subCategory: r.sub_category ?? "",
      date: r.date,
      type: "equity",
      strategy: r.strategy ?? undefined,
    }));

    const mfHoldings: Holding[] = mfRows.map((r) => ({
      symbol: r.symbol ?? "",
      exchange: "",
      quantity: num(r.quantity),
      avgPrice: num(r.avg_price),
      ltp: num(r.nav),
      buyValue: num(r.buy_value),
      valueAsOfToday: num(r.value_as_of_today),
      pnlAmount: num(r.pnl_amount),
      percentPnl: num(r.percent_pnl),
      broker: r.broker ?? "",
      debtEquity: r.debt_equity ?? "",
      subCategory: r.sub_category ?? "",
      date: r.as_of_date,
      type: "mutual_fund",
      isin: r.isin ?? undefined,
      strategy: r.strategy ?? undefined,
    }));

    const allHoldings = [...equityHoldings, ...mfHoldings];
    const holdingsSummary = processHoldingsSummary(allHoldings);

    const availableStrategies = Array.from(
      new Set(
        allHoldings.map((h) => h.strategy).filter((s): s is string => !!s)
      )
    );

    const dataAsOfDate =
      latestEquity?.date?.toISOString() ??
      latestMf?.as_of_date?.toISOString() ??
      null;

    return NextResponse.json({
      holdingsSummary,
      availableStrategies,
      dataAsOfDate,
    });
  } catch (error) {
    console.error("Bifurcated holdings API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Verify read-only**

Run:
```bash
grep -nE "prisma\.[a-zA-Z_]+\.(create|createMany|update|updateMany|delete|deleteMany|upsert)|\\\$executeRaw" app/api/bifurcated-holdings/route.ts
```
Expected: no output (exit code 1). If anything matches, the route violates CLAUDE.md — fix before committing.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/bifurcated-holdings/route.ts
git commit -m "feat(bifurcated): add parameterized /api/bifurcated-holdings route"
```

---

### Task 11: Create the generalized investigation script

**Files:**
- Create: `scripts/investigate-bifurcated-client.ts`

Generalized from the existing `scripts/investigate-ashwin-data.ts`. Same Prisma operations (READ-ONLY), parametrized by CLI qcode arg, emits paste-ready config + registry blocks.

- [ ] **Step 1: Read the existing script as reference**

Read `scripts/investigate-ashwin-data.ts` to confirm the existing Prisma query patterns (all `findFirst`/`findMany`/`count` — none of `create`/`update`/`delete`/`upsert`).

- [ ] **Step 2: Create the new script**

Use `Write` for `scripts/investigate-bifurcated-client.ts`:

```ts
/**
 * Investigation Script: bifurcated_master_sheet_test client onboarding
 *
 * PURPOSE: Given a qcode, gather everything a teammate needs to add a new
 * bifurcated client. Emits a paste-ready defineBifurcatedClient(...) block
 * with inception dates filled in, plus a paste-ready registry entry.
 *
 * THIS SCRIPT IS READ-ONLY — NO DATABASE MODIFICATIONS.
 * All queries are SELECT operations only (findFirst / findMany / count).
 *
 * Usage:
 *   npx ts-node scripts/investigate-bifurcated-client.ts <qcode> [name-search]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function fmtDate(d: Date | null | undefined): string {
  return d ? d.toISOString().split("T")[0] : "NO DATA";
}

interface SchemeInfo {
  schemeName: string;        // e.g. "Scheme QYE++"
  prefix: string;            // e.g. "QYE++"
  exposureTagGuess: string;  // e.g. "QYE++ Zerodha Total Portfolio"
  inceptionDate: string;     // YYYY-MM-DD
}

async function main() {
  const [, , qcodeArg, nameArg] = process.argv;
  if (!qcodeArg) {
    console.error("Usage: npx ts-node scripts/investigate-bifurcated-client.ts <qcode> [name-search]");
    process.exit(1);
  }
  const qcode = qcodeArg;

  console.log("=".repeat(80));
  console.log(`INVESTIGATION: ${qcode}${nameArg ? ` (name~${nameArg})` : ""}`);
  console.log("=".repeat(80));
  console.log("\nAll queries are READ-ONLY (SELECT only)\n");

  // 1. Account + client identity
  console.log("─".repeat(80));
  console.log("1. ACCOUNT + CLIENT IDENTITY");
  console.log("─".repeat(80));

  const account = await prisma.accounts.findFirst({
    where: { qcode },
    select: {
      qcode: true,
      account_name: true,
      account_type: true,
      broker: true,
    },
  });
  if (!account) {
    console.log(`  Account ${qcode} not found in accounts table.`);
    await prisma.$disconnect();
    process.exit(2);
  }
  console.log(`  qcode:        ${account.qcode}`);
  console.log(`  account_name: ${account.account_name}`);
  console.log(`  account_type: ${account.account_type}`);
  console.log(`  broker:       ${account.broker}`);

  const accessRows = await prisma.pooled_account_users.findMany({
    where: { qcode },
    select: { icode: true },
  });
  const linkedIcodes = accessRows.map((r) => r.icode);
  console.log(`  Linked icodes via pooled_account_users: ${linkedIcodes.join(", ") || "(none)"}`);

  let chosenIcode = linkedIcodes[0] ?? "QUS00XXX";
  if (nameArg) {
    const nameMatches = await prisma.clients.findMany({
      where: { user_name: { contains: nameArg, mode: "insensitive" } },
      select: { icode: true, user_name: true },
    });
    nameMatches.forEach((c) =>
      console.log(`  Name match: icode=${c.icode} name="${c.user_name}"`)
    );
    if (nameMatches.length === 1) chosenIcode = nameMatches[0].icode;
  }

  // 2. Distinct system_tags in bifurcated_master_sheet_test
  console.log("\n" + "─".repeat(80));
  console.log(`2. DISTINCT system_tag IN bifurcated_master_sheet_test WHERE qcode = ${qcode}`);
  console.log("─".repeat(80));

  const tagRows = await prisma.bifurcated_master_sheet_test.findMany({
    where: { qcode },
    distinct: ["system_tag"],
    select: { system_tag: true },
  });
  console.log(`  ${tagRows.length} distinct tag(s) found.`);

  // 3. Detect schemes (heuristic: tags starting with "<PREFIX>++ Zerodha Total Portfolio")
  const schemes: SchemeInfo[] = [];
  const exposureTagRegex = /^([A-Z]+\+\+)\s+Zerodha Total Portfolio$/;
  for (const { system_tag } of tagRows) {
    const m = system_tag.match(exposureTagRegex);
    if (m) {
      const prefix = m[1];
      const schemeName = `Scheme ${prefix}`;
      const minRow = await prisma.bifurcated_master_sheet_test.findFirst({
        where: { qcode, system_tag },
        orderBy: { date: "asc" },
        select: { date: true },
      });
      const maxRow = await prisma.bifurcated_master_sheet_test.findFirst({
        where: { qcode, system_tag },
        orderBy: { date: "desc" },
        select: { date: true },
      });
      const cnt = await prisma.bifurcated_master_sheet_test.count({
        where: { qcode, system_tag },
      });
      const inception = fmtDate(minRow?.date);
      schemes.push({
        schemeName,
        prefix,
        exposureTagGuess: system_tag,
        inceptionDate: inception,
      });
      console.log(
        `  Detected ${schemeName} via "${system_tag}": ${cnt} rows, ${inception} → ${fmtDate(maxRow?.date)}`
      );
    }
  }

  // 4. Qode Total Portfolio presence
  console.log("\n" + "─".repeat(80));
  console.log("3. Qode Total Portfolio PRESENCE");
  console.log("─".repeat(80));
  const qtpCount = await prisma.bifurcated_master_sheet_test.count({
    where: { qcode, system_tag: "Qode Total Portfolio" },
  });
  console.log(qtpCount > 0 ? `  ✓ present (${qtpCount} rows)` : "  ✗ MISSING — talk to data team");

  // 5. Holdings presence
  console.log("\n" + "─".repeat(80));
  console.log("4. HOLDINGS PRESENCE");
  console.log("─".repeat(80));
  const eqCount = await prisma.bifurcated_equity_holding_test.count({ where: { qcode } });
  const mfCount = await prisma.bifurcated_mutual_fund_holding_sheet_test.count({
    where: { qcode },
  });
  console.log(`  bifurcated_equity_holding_test:                 ${eqCount} rows`);
  console.log(`  bifurcated_mutual_fund_holding_sheet_test:      ${mfCount} rows`);

  // 6. Paste-ready blocks
  console.log("\n" + "=".repeat(80));
  console.log("READY-TO-PASTE CONFIG (save to app/lib/clients/<name>.ts)");
  console.log("=".repeat(80));
  const fileName = (account.account_name || "newclient")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  console.log(`
import { defineBifurcatedClient } from "../bifurcated-portfolio-utils";

export const ${fileName.toUpperCase().replace(/-/g, "_")}_CONFIG = defineBifurcatedClient({
  name: "${account.account_name}",
  qcode: "${qcode}",`);
  if (schemes.length === 0) {
    console.log(`  schemes: { /* no schemes auto-detected — add manually */ },`);
  } else {
    console.log(`  schemes: {`);
    for (const s of schemes) {
      console.log(`    "${s.schemeName}": {`);
      console.log(`      inceptionDate: "${s.inceptionDate}",`);
      console.log(`      exposure: "<FILL_FROM_DATA_TEAM>",  // hint: detected "${s.exposureTagGuess}"`);
      console.log(`      profit:   "<FILL_FROM_DATA_TEAM>",`);
      console.log(`    },`);
    }
    console.log(`  },`);
  }
  console.log(`});
`);

  console.log("=".repeat(80));
  console.log("READY-TO-PASTE REGISTRY ENTRY (append to app/lib/bifurcated-clients-registry.ts)");
  console.log("=".repeat(80));
  console.log(`
  {
    icode: "${chosenIcode}",
    qcode: "${qcode}",
    displayName: "${account.account_name}",
    config: ${fileName.toUpperCase().replace(/-/g, "_")}_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },
`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
```

- [ ] **Step 3: Verify read-only**

Run:
```bash
grep -nE "prisma\.[a-zA-Z_]+\.(create|createMany|update|updateMany|delete|deleteMany|upsert)|\\\$executeRaw" scripts/investigate-bifurcated-client.ts
```
Expected: no output.

- [ ] **Step 4: Smoke-test on Ashwin's qcode**

Run: `npx ts-node scripts/investigate-bifurcated-client.ts QAC00083 Ashwin`
Expected: prints sections 1–4 with non-empty data, then emits a paste-ready config block listing `Scheme QYE++` and `Scheme QAW++` with their inception dates `2026-02-24` and `2026-05-04` respectively.

- [ ] **Step 5: Commit**

```bash
git add scripts/investigate-bifurcated-client.ts
git commit -m "feat(bifurcated): add generalized investigation script with paste-ready output"
```

---

### Task 12: Create the registry validator script

**Files:**
- Create: `scripts/validate-bifurcated-registry.ts`

- [ ] **Step 1: Create the file**

Use `Write` for `scripts/validate-bifurcated-registry.ts`:

```ts
/**
 * Validator: bifurcated-clients-registry sanity check
 *
 * For each entry in BIFURCATED_CLIENTS, confirms the client exists in the DB,
 * the account exists, every scheme tag has data, inception dates match
 * MIN(date) in bifurcated_master_sheet_test, and Qode Total Portfolio is
 * populated.
 *
 * THIS SCRIPT IS READ-ONLY — NO DATABASE MODIFICATIONS.
 *
 * Usage: npx ts-node scripts/validate-bifurcated-registry.ts
 */

import { PrismaClient } from "@prisma/client";
import { BIFURCATED_CLIENTS } from "../app/lib/bifurcated-clients-registry";

const prisma = new PrismaClient();

let failures = 0;
const fail = (msg: string) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

async function main() {
  console.log("=".repeat(80));
  console.log("VALIDATING BIFURCATED_CLIENTS registry");
  console.log("=".repeat(80));

  // Duplicate qcode check (registry integrity)
  const seenQcodes = new Set<string>();
  for (const c of BIFURCATED_CLIENTS) {
    if (seenQcodes.has(c.qcode)) {
      fail(`duplicate qcode in registry: ${c.qcode}`);
    }
    seenQcodes.add(c.qcode);
  }

  for (const entry of BIFURCATED_CLIENTS) {
    console.log("\n" + "─".repeat(80));
    console.log(`Entry: ${entry.displayName} (icode=${entry.icode}, qcode=${entry.qcode})`);
    console.log("─".repeat(80));

    // 1. icode in clients table
    const client = await prisma.clients.findFirst({
      where: { icode: entry.icode },
      select: { icode: true, user_name: true },
    });
    client
      ? ok(`icode found in clients: "${client.user_name}"`)
      : fail(`icode ${entry.icode} NOT in clients table`);

    // 2. qcode in accounts table
    const account = await prisma.accounts.findFirst({
      where: { qcode: entry.qcode },
      select: { qcode: true, account_name: true },
    });
    account
      ? ok(`qcode found in accounts: "${account.account_name}"`)
      : fail(`qcode ${entry.qcode} NOT in accounts table`);

    // 3. Per-scheme inception date matches MIN(date)
    const schemes = entry.config.portfolioMapping;
    for (const [schemeName, sc] of Object.entries(schemes)) {
      if (schemeName === "Total Portfolio") continue;
      if (!sc.tags) continue;
      const minRow = await prisma.bifurcated_master_sheet_test.findFirst({
        where: { qcode: entry.qcode, system_tag: sc.tags.depositTag },
        orderBy: { date: "asc" },
        select: { date: true },
      });
      if (!minRow) {
        fail(`${schemeName}: NO ROWS for deposit tag "${sc.tags.depositTag}"`);
        continue;
      }
      const dbMin = minRow.date.toISOString().split("T")[0];
      const configMin = sc.tags.startDate.toISOString().split("T")[0];
      const dbDay = new Date(dbMin).getTime();
      const cfgDay = new Date(configMin).getTime();
      const diffDays = Math.abs(dbDay - cfgDay) / 86400000;
      if (diffDays <= 1) {
        ok(`${schemeName}: inception ${configMin} matches DB MIN ${dbMin}`);
      } else {
        fail(`${schemeName}: config inception ${configMin} differs from DB MIN ${dbMin} by ${diffDays} days`);
      }
    }

    // 4. Qode Total Portfolio populated (only if config opts in)
    if (entry.config.qodeTotalPortfolioTag) {
      const tpCount = await prisma.bifurcated_master_sheet_test.count({
        where: {
          qcode: entry.qcode,
          system_tag: entry.config.qodeTotalPortfolioTag,
        },
      });
      tpCount > 0
        ? ok(`"${entry.config.qodeTotalPortfolioTag}" present (${tpCount} rows)`)
        : fail(`"${entry.config.qodeTotalPortfolioTag}" MISSING for qcode ${entry.qcode}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  if (failures === 0) {
    console.log("✓ Registry valid — all entries OK");
  } else {
    console.log(`✗ ${failures} failure(s) — fix before deploying`);
  }
  console.log("=".repeat(80));

  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
```

- [ ] **Step 2: Verify read-only**

Run:
```bash
grep -nE "prisma\.[a-zA-Z_]+\.(create|createMany|update|updateMany|delete|deleteMany|upsert)|\\\$executeRaw" scripts/validate-bifurcated-registry.ts
```
Expected: no output.

- [ ] **Step 3: Run the validator**

Run: `npx ts-node scripts/validate-bifurcated-registry.ts`
Expected: exit 0; prints `✓ Registry valid` for all 3 entries.

If any entry fails — especially inception date mismatch for Arwani — that's evidence the helper-built config doesn't match the prior verbose config. Investigate before continuing.

- [ ] **Step 4: Commit**

```bash
git add scripts/validate-bifurcated-registry.ts
git commit -m "feat(bifurcated): add registry validator script"
```

---

### Task 13: Add the runbook

**Files:**
- Create: `docs/how-to-add-a-bifurcated-client.md`

- [ ] **Step 1: Create the runbook**

Use `Write` for `docs/how-to-add-a-bifurcated-client.md`:

```md
# How to add a new bifurcated client

This runbook covers onboarding a new client whose data lives in
`bifurcated_master_sheet_test`. It assumes Dinesh / Arwani / Ashwin are
already in the registry as reference examples.

## Prerequisites

1. The data team has sent the client's scheme/tag spec, e.g.:

   > Mangesh Hirve
   >
   > Scheme QAW++
   > For profit and exposure both - QAW++ Zerodha Total Portfolio
   >
   > Scheme QYE++
   > For profit - QYE++ Total Portfolio Value and exposure - QYE++ Zerodha Total Portfolio

2. The data team has populated `bifurcated_master_sheet_test` for the
   client's qcode, including a `Qode Total Portfolio` row for each date.

3. You know the client's qcode (e.g. `QAC00091`).

## Steps

### Step 1 — Run the investigation script

```bash
npx ts-node scripts/investigate-bifurcated-client.ts QAC00091 "Mangesh"
```

The script outputs:
- Confirmed `icode`, `qcode`, account name from the `clients` / `accounts` /
  `pooled_account_users` tables.
- Each scheme detected via the `<PREFIX>++ Zerodha Total Portfolio` pattern,
  with its `MIN(date)` (= inception).
- Confirmation that `Qode Total Portfolio` data is present.
- A **paste-ready config block** for `app/lib/clients/<name>.ts`.
- A **paste-ready registry entry** for `bifurcated-clients-registry.ts`.

### Step 2 — Create the client config file

Save the config block to a new file, e.g. `app/lib/clients/mangesh.ts`.

Fill in the two `<FILL_FROM_DATA_TEAM>` placeholders for each scheme using
the data team's message:
- `exposure` is the tag they listed for **exposure**.
- `profit` is the tag they listed for **profit**.

If both fields are the same tag (as in "for profit and exposure both"),
just paste the same string for both.

### Step 3 — Append the registry entry

Open `app/lib/bifurcated-clients-registry.ts` and append the entry to the
`BIFURCATED_CLIENTS` array. Also add the import at the top:

```ts
import { MANGESH_CONFIG } from "./clients/mangesh";
```

### Step 4 — Validate

```bash
npx ts-node scripts/validate-bifurcated-registry.ts
```

Must exit `0` with `✓ Registry valid`. If it fails:
- "icode NOT in clients table" — wrong icode; double-check with the script
  output from Step 1.
- "inception differs from DB MIN" — wrong inception date; re-run Step 1 and
  copy the dates verbatim.
- "Qode Total Portfolio MISSING" — data team has not populated this tag
  yet; coordinate with them before continuing.

### Step 5 — Build and commit

```bash
npm run build
git add app/lib/clients/mangesh.ts app/lib/bifurcated-clients-registry.ts
git commit -m "feat(bifurcated): add client Mangesh Hirve"
```

## What this WILL automatically work

- Dashboard recognizes the new icode and renders the three views (Total
  Portfolio, plus each declared scheme).
- `/api/bifurcated-portfolio?qcode=<qcode>` returns the portfolio JSON.
- `/api/bifurcated-holdings?qcode=<qcode>` returns the holdings JSON.
- Holdings page recognizes the new client and shows their equity + MF
  holdings with strategy filtering.

## What you do NOT need to touch

- `app/dashboard/page.tsx` — reads the registry; no ternary updates required.
- `app/holding-summary/page.tsx` — same.
- `app/lib/bifurcated-portfolio-utils.ts` — engine class internals unchanged.
- The legacy per-client routes — none are created for new clients.
- The `BifurcatedPortfolioEngine` class — no instances declared explicitly;
  the registry's `engineByQcode` map creates them automatically.

## When to use the verbose `ClientConfig` instead of `defineBifurcatedClient`

The helper covers the dominant "multi-parallel-active-schemes + Qode Total
Portfolio aggregate" pattern. If the new client has an inactive scheme
(like Dinesh's QTF), the helper does not model that — write a verbose
`ClientConfig` directly, modeled on `app/lib/clients/dinesh.ts`.

## Database safety

All scripts and the new routes are READ-ONLY per `CLAUDE.md`. None of the
operations introduced for this client onboarding create, update, delete, or
upsert any data. If you find yourself wanting to modify the DB to make
something work, you are off the happy path — talk to the data team instead.
```

- [ ] **Step 2: Commit**

```bash
git add docs/how-to-add-a-bifurcated-client.md
git commit -m "docs(bifurcated): add runbook for onboarding new bifurcated clients"
```

---

### Task 14: Verification gate — both old and new URLs return identical JSON

**Files:** none modified — verification only.

The strangler-fig contract: after Phase A, hitting both the old and new URLs must produce byte-identical responses for all 3 bifurcated clients.

- [ ] **Step 1: Start the dev server in the background**

Run: `npm run dev` in a separate terminal (or background it). Wait for it to reach `Ready in N ms`.

- [ ] **Step 2: Smoke-test the new portfolio route is reachable**

Run (browser or curl with session cookie — auth required):
```
GET http://localhost:2030/api/bifurcated-portfolio?qcode=QAC00083
```
Expected: 200 with JSON containing keys `Total Portfolio`, `Scheme QYE++`, `Scheme QAW++`. If 403 — verify you're logged in as `QUS00097`.

- [ ] **Step 3: Compare new vs old responses for all 3 clients**

For each pair below, fetch both URLs (must be done while logged in as the matching client) and confirm the JSON bodies are deep-equal:

| Client | Login as | New URL | Old URL |
|---|---|---|---|
| Dinesh | `QUS00072` | `/api/bifurcated-portfolio?qcode=QAC00053` | `/api/dinesh-api?qcode=QAC00053` |
| Arwani | `QUS00085` | `/api/bifurcated-portfolio?qcode=QAC00071` | `/api/arwani-api?qcode=QAC00071` |
| Ashwin | `QUS00097` | `/api/bifurcated-portfolio?qcode=QAC00083` | `/api/ashwin-api?qcode=QAC00083` |

For each pair, save the responses and run a diff (e.g. `diff <(curl -s --cookie ... URL_A | jq -S .) <(curl -s --cookie ... URL_B | jq -S .)`). Expected: empty diff.

Repeat the same matrix for holdings:

| Client | New URL | Old URL |
|---|---|---|
| Dinesh | `/api/bifurcated-holdings?qcode=QAC00053` | `/api/dinesh-holdings-api` |
| Arwani | `/api/bifurcated-holdings?qcode=QAC00071` | `/api/arwani-holdings-api` |
| Ashwin | `/api/bifurcated-holdings?qcode=QAC00083` | `/api/ashwin-holdings-api` |

- [ ] **Step 4: Report**

If ALL pairs match: Phase A is sound; proceed to Task 15.
If ANY pair differs: stop and investigate the diff. The most likely cause is the helper producing a different `ClientConfig` than the prior verbose version — re-check Tasks 4/5 outputs against the values in Tasks 2/3 originals.

(No commit at this step — it's a verification gate only.)

---

## Phase B — Repoint frontend (Tasks 15–16)

### Task 15: Repoint `app/dashboard/page.tsx` to use the registry

**Files:**
- Modify: `app/dashboard/page.tsx`

Replace the 5 ternary touchpoints with registry lookups. Shilpa/Vikram fallback branch preserved.

- [ ] **Step 1: Read the current detection block**

Read `app/dashboard/page.tsx` lines 418–430 to confirm the existing `is*` declarations.

- [ ] **Step 2: Replace detection block + extend `isBifurcatedClient`**

Use `Edit`. `old_string`:
```ts
  const isDinesh = effectiveIcode === "QUS00072";
  const isShilpa = effectiveIcode === "QUS00067";
  const isVikram = effectiveIcode === "QUS00068";
  const isArwani = effectiveIcode === "QUS00085";
  const isAshwin = effectiveIcode === "QUS00097";
  const isBifurcatedClient = isDinesh || isShilpa || isVikram || isArwani || isAshwin;
```

`new_string`:
```ts
  // Registry-driven for the 3 bifurcated_master_sheet_test clients. Shilpa and
  // Vikram remain on legacy per-client routes until their data migrates.
  const bifurcatedClient = findByIcode(effectiveIcode);
  const isShilpa = effectiveIcode === "QUS00067";
  const isVikram = effectiveIcode === "QUS00068";
  const isBifurcatedClient = !!bifurcatedClient || isShilpa || isVikram;
```

- [ ] **Step 3: Add the registry import at the top of the file**

Use `Edit`. Insert the import after the existing imports. Read lines 1–30 to find a good insertion point. `old_string` (any existing import line that's unique, e.g.):
```ts
import { useSession } from "next-auth/react";
```
`new_string`:
```ts
import { useSession } from "next-auth/react";
import { findByIcode } from "@/app/lib/bifurcated-clients-registry";
```

(If that exact import line isn't present, use any other unique existing import line.)

- [ ] **Step 4: Replace the `bifurcatedConfig` ternary**

Use `Edit`. `old_string`:
```ts
        const bifurcatedConfig = isDinesh
          ? { api: "/api/dinesh-api", qcode: "QAC00053", name: "Dinesh" }
          : isShilpa
          ? { api: "/api/shilpa-api", qcode: "QAC00040", name: "Shilpa" }
          : isVikram
          ? { api: "/api/vikram-api", qcode: "QAC00043", name: "Vikram Trading" }
          : isArwani
          ? { api: "/api/arwani-api", qcode: "QAC00071", name: "Arwani" }
          : { api: "/api/ashwin-api", qcode: "QAC00083", name: "Ashwin Agarwal" };
```

`new_string`:
```ts
        const bifurcatedConfig = bifurcatedClient
          ? {
              api: "/api/bifurcated-portfolio",
              qcode: bifurcatedClient.qcode,
              name: bifurcatedClient.displayName,
            }
          : isShilpa
          ? { api: "/api/shilpa-api", qcode: "QAC00040", name: "Shilpa" }
          : { api: "/api/vikram-api", qcode: "QAC00043", name: "Vikram Trading" };
```

- [ ] **Step 5: Replace `hasNavBasedTotalPortfolio`**

Use `Edit`. `old_string`:
```ts
    const hasNavBasedTotalPortfolio = isDinesh || isArwani || isAshwin;
```
`new_string`:
```ts
    const hasNavBasedTotalPortfolio = bifurcatedClient?.hasNavBasedTotalPortfolio ?? false;
```

- [ ] **Step 6: Replace the broker label ternary on `<StatsCards>`**

Use `Edit`. `old_string`:
```ts
          broker={isDinesh ? "Dinesh" : isShilpa ? "Shilpa" : isVikram ? "Vikram Trading" : isArwani ? "Arwani" : "Ashwin Agarwal"}
```
`new_string`:
```ts
          broker={bifurcatedClient?.displayName ?? (isShilpa ? "Shilpa" : "Vikram Trading")}
```

- [ ] **Step 7: Replace the empty-state error label ternary**

Use `Edit`. `old_string`:
```ts
        No strategy data found for {isSarla ? "Sarla" : isSatidham ? "Satidham" : isDinesh ? "Dinesh" : isShilpa ? "Shilpa" : isVikram ? "Vikram Trading" : isArwani ? "Arwani" : "Ashwin Agarwal"} user.
```
`new_string`:
```ts
        No strategy data found for {isSarla ? "Sarla" : isSatidham ? "Satidham" : bifurcatedClient?.displayName ?? (isShilpa ? "Shilpa" : "Vikram Trading")} user.
```

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: exit 0. TypeScript will flag any stale `isDinesh` / `isArwani` / `isAshwin` references in the file — if so, replace them with `!!bifurcatedClient` or a more specific check. The previous detection variables are now removed, so any remaining usages are bugs.

- [ ] **Step 9: Manual smoke test**

Start the dev server (or refresh if still running). Log in as each of:
- `QUS00072` (Dinesh) — dashboard loads, strategy dropdown shows 4 schemes including QTF.
- `QUS00085` (Arwani) — dashboard loads, 3 schemes.
- `QUS00097` (Ashwin) — dashboard loads, 3 schemes.
- `QUS00067` (Shilpa) — dashboard loads via legacy path; still works.
- `QUS00068` (Vikram) — dashboard loads via legacy path; still works.

- [ ] **Step 10: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "refactor(bifurcated): repoint dashboard to use registry lookup"
```

---

### Task 16: Repoint `app/holding-summary/page.tsx` to use the registry

**Files:**
- Modify: `app/holding-summary/page.tsx`

Replace the 3 per-client fetchers with a single `fetchBifurcatedHoldings` that uses the registry. The dispatch chain collapses.

- [ ] **Step 1: Add the registry import**

Use `Edit`. Pick an existing unique import line and append. `old_string`:
```ts
import { useSession } from "next-auth/react";
```
`new_string`:
```ts
import { useSession } from "next-auth/react";
import { findByIcode } from "@/app/lib/bifurcated-clients-registry";
```

(If `useSession` isn't imported in this file, pick another unique line.)

- [ ] **Step 2: Replace the detection block**

Use `Edit`. `old_string`:
```ts
    const isArwani = session?.user?.icode === "QUS00085";
    const isAshwin = session?.user?.icode === "QUS00097";
    const isDinesh = session?.user?.icode === "QUS00072";
```

`new_string`:
```ts
    const bifurcatedClient = findByIcode(session?.user?.icode ?? "");
```

- [ ] **Step 3: Replace the dispatch chain in the auth `useEffect`**

Use `Edit`. `old_string`:
```ts
        if (isArwani) {
            fetchArwaniHoldings();
        } else if (isAshwin) {
            fetchAshwinHoldings();
        } else if (isDinesh) {
            fetchDineshHoldings();
        } else if (isSarla || isSatidham) {
            fetchHoldingsForSpecialAccounts();
        } else {
            fetchAccounts();
        }
    }, [status, router, isSarla, isSatidham, isArwani, isAshwin, isDinesh, accountCode]);
```

`new_string`:
```ts
        if (bifurcatedClient) {
            fetchBifurcatedHoldings(bifurcatedClient.qcode);
        } else if (isSarla || isSatidham) {
            fetchHoldingsForSpecialAccounts();
        } else {
            fetchAccounts();
        }
    }, [status, router, isSarla, isSatidham, bifurcatedClient, accountCode]);
```

- [ ] **Step 4: Replace the second `useEffect` guard + deps**

Use `Edit`. `old_string`:
```ts
    useEffect(() => {
        if (selectedAccount && !isSarla && !isSatidham && !isArwani && !isAshwin && !isDinesh) {
            fetchHoldingsData();
        }
    }, [selectedAccount, isSarla, isSatidham, isArwani, isAshwin, isDinesh]);
```

`new_string`:
```ts
    useEffect(() => {
        if (selectedAccount && !isSarla && !isSatidham && !bifurcatedClient) {
            fetchHoldingsData();
        }
    }, [selectedAccount, isSarla, isSatidham, bifurcatedClient]);
```

- [ ] **Step 5: Replace the 3 per-client fetchers with one**

Use `Edit`. `old_string` (the 3 fetchers in sequence — adapt the boundary to match the file exactly):
```ts
    const fetchArwaniHoldings = async () => {
```

If that `old_string` isn't unique enough, use a longer block including the surrounding context. The goal is to replace all three (`fetchArwaniHoldings`, `fetchAshwinHoldings`, `fetchDineshHoldings`) with one `fetchBifurcatedHoldings`. Read lines 566–640 to find the exact span to replace.

Replace the 3 functions (~75 lines combined) with:

```ts
    const fetchBifurcatedHoldings = async (qcode: string) => {
        try {
            const res = await fetch(`/api/bifurcated-holdings?qcode=${qcode}`, { credentials: "include" });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to load holdings");
            }
            const data: {
                holdingsSummary: HoldingsSummary;
                availableStrategies: string[];
                dataAsOfDate: string | null;
            } = await res.json();

            setHoldingsData(data.holdingsSummary);
            setAvailableStrategies(data.availableStrategies || []);
            if (data.dataAsOfDate) {
                const d = new Date(data.dataAsOfDate);
                if (!isNaN(d.getTime())) setLastUpdatedDate(d);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load holdings data");
        } finally {
            setIsLoading(false);
        }
    };
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: exit 0. Stale references to `isArwani` / `isAshwin` / `isDinesh` / `fetchArwaniHoldings` / `fetchAshwinHoldings` / `fetchDineshHoldings` would cause type errors — if so, remove them.

- [ ] **Step 7: Manual smoke test**

Log into `/holding-summary` as each of Dinesh / Arwani / Ashwin; confirm holdings render and strategies filter works. (Shilpa/Vikram don't have holdings pages today — unchanged.)

- [ ] **Step 8: Commit**

```bash
git add app/holding-summary/page.tsx
git commit -m "refactor(bifurcated): repoint holding-summary to use registry + parameterized API"
```

---

## Phase C — Delete dead per-client URL routes (Task 17)

### Task 17: Delete 6 legacy per-client URL route files

**Files:**
- Delete: `app/api/dinesh-api/route.ts`
- Delete: `app/api/dinesh-holdings-api/route.ts`
- Delete: `app/api/arwani-api/route.ts`
- Delete: `app/api/arwani-holdings-api/route.ts`
- Delete: `app/api/ashwin-api/route.ts`
- Delete: `app/api/ashwin-holdings-api/route.ts`

The `*Api` shim exports in `bifurcated-portfolio-utils.ts` stay (distributor-utils uses `DineshApi`). Shilpa and Vikram routes (`/api/shilpa-api`, `/api/vikram-api`) stay.

- [ ] **Step 1: Confirm no remaining external references to the deletable URLs**

Run:
```bash
grep -rnE "/api/(dinesh|arwani|ashwin)-api|/api/(dinesh|arwani|ashwin)-holdings-api" \
  --include='*.ts' --include='*.tsx' /Users/vyomthakkar/Downloads/qode-dashboard-new/app \
  --include='*.ts' --include='*.tsx' /Users/vyomthakkar/Downloads/qode-dashboard-new/components \
  --include='*.ts' --include='*.tsx' /Users/vyomthakkar/Downloads/qode-dashboard-new/lib \
  2>/dev/null
```
Expected: empty output. Any match means the frontend repoint in Tasks 15–16 missed something — go fix that first.

- [ ] **Step 2: Confirm `DineshApi`/`ArwaniApi`/`AshwinApi` shims still have their consumers**

Run:
```bash
grep -rnE "DineshApi|ArwaniApi|AshwinApi" \
  --include='*.ts' --include='*.tsx' /Users/vyomthakkar/Downloads/qode-dashboard-new \
  | grep -v node_modules | grep -v '.next/' | grep -v bifurcated-portfolio-utils.ts \
  | grep -v arwani-portfolio-utils.ts | grep -v 'app/api/'
```
Expected: should show `app/lib/distributor-utils.ts:3` and `:795` only (the legitimate consumer). Anything else is unexpected — investigate.

- [ ] **Step 3: Delete the 6 files**

Run:
```bash
rm app/api/dinesh-api/route.ts
rm app/api/dinesh-holdings-api/route.ts
rm app/api/arwani-api/route.ts
rm app/api/arwani-holdings-api/route.ts
rm app/api/ashwin-api/route.ts
rm app/api/ashwin-holdings-api/route.ts
rmdir app/api/dinesh-api app/api/dinesh-holdings-api \
      app/api/arwani-api app/api/arwani-holdings-api \
      app/api/ashwin-api app/api/ashwin-holdings-api
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exit 0. The deleted routes won't appear in the route manifest anymore.

- [ ] **Step 5: Sanity check — old URLs now 404, new URLs still work, distributor flow still works**

Manually:
- GET `http://localhost:2030/api/dinesh-api?qcode=QAC00053` → expect 404 (route removed).
- GET `http://localhost:2030/api/bifurcated-portfolio?qcode=QAC00053` (logged in as Dinesh) → still 200.
- Load the distributor view (whatever URL triggers `app/lib/distributor-utils.ts:795`) → confirm it still shows Dinesh's data via the `DineshApi` shim.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(bifurcated): delete legacy per-client URL routes (shims in utils file remain)"
```

---

## Phase D — Final verification (Task 18)

### Task 18: Full regression sweep + read-only audit + lint + build

**Files:** none modified — gates only.

- [ ] **Step 1: Full build + lint**

Run:
```bash
npm run build
npm run lint
```
Both must exit 0.

- [ ] **Step 2: Read-only audit on every file changed in this feature**

Run:
```bash
git diff main...HEAD --name-only -- 'app/**/*.ts' 'app/**/*.tsx' 'scripts/**/*.ts' \
  | xargs grep -nE "prisma\.[a-zA-Z_]+\.(create|createMany|update|updateMany|delete|deleteMany|upsert)|\\\$executeRaw" \
  || echo "OK — no write operations found"
```
Expected: `OK — no write operations found`. Any match is a CLAUDE.md violation and must be fixed.

- [ ] **Step 3: Run the validator**

Run: `npx ts-node scripts/validate-bifurcated-registry.ts`
Expected: exit 0; `✓ Registry valid`.

- [ ] **Step 4: Full client-view regression**

Log into the dashboard as each of:
- `QUS00072` (Dinesh) — dashboard + holding-summary work.
- `QUS00085` (Arwani) — same.
- `QUS00097` (Ashwin) — same.
- `QUS00067` (Shilpa) — dashboard works; no regression (still legacy path).
- `QUS00068` (Vikram) — dashboard works; no regression.

Spot-check Sarla / Satidham / a PMS client / a regular managed client to confirm unrelated flows untouched.

- [ ] **Step 5: Distributor flow**

Load whichever UI page triggers `app/lib/distributor-utils.ts` (search the codebase for the distributor view's entry point if unclear). Confirm Dinesh's data still appears — verifies the `DineshApi` shim works after the refactor.

- [ ] **Step 6: Final commit (only if anything was fixed in Steps 1–5)**

If a fix was needed:
```bash
git add <fixed files>
git commit -m "fix(bifurcated): <what was fixed>"
```
Otherwise no commit at this step.

---

## File Structure Summary

| Path | Action | Purpose |
|---|---|---|
| `app/lib/bifurcated-portfolio-utils.ts` | Modify | Export types, add helper, switch to engineByQcode map, rewire shims |
| `app/lib/bifurcated-clients-registry.ts` | Create | Single source of truth for bifurcated clients |
| `app/lib/bifurcated-auth.ts` | Create | Shared auth helper for parameterized routes |
| `app/lib/clients/dinesh.ts` | Create | Dinesh config (verbose, has inactive QTF) |
| `app/lib/clients/shilpa.ts` | Create | Shilpa config (verbose, legacy) |
| `app/lib/clients/vikram.ts` | Create | Vikram config (verbose, legacy) |
| `app/lib/clients/arwani.ts` | Create | Arwani config via helper |
| `app/lib/clients/ashwin.ts` | Create | Ashwin config via helper |
| `app/api/bifurcated-portfolio/route.ts` | Create | Parameterized portfolio route |
| `app/api/bifurcated-holdings/route.ts` | Create | Parameterized holdings route |
| `app/api/dinesh-api/route.ts` | Delete (Task 17) | Replaced by parameterized route |
| `app/api/dinesh-holdings-api/route.ts` | Delete (Task 17) | Replaced |
| `app/api/arwani-api/route.ts` | Delete (Task 17) | Replaced |
| `app/api/arwani-holdings-api/route.ts` | Delete (Task 17) | Replaced |
| `app/api/ashwin-api/route.ts` | Delete (Task 17) | Replaced |
| `app/api/ashwin-holdings-api/route.ts` | Delete (Task 17) | Replaced |
| `app/api/shilpa-api/route.ts` | Untouched | Legacy client |
| `app/api/vikram-api/route.ts` | Untouched | Legacy client |
| `app/dashboard/page.tsx` | Modify (Task 15) | Use registry lookup |
| `app/holding-summary/page.tsx` | Modify (Task 16) | Use registry + parameterized API |
| `app/lib/distributor-utils.ts` | Untouched | Keeps using `DineshApi` shim |
| `scripts/investigate-bifurcated-client.ts` | Create | Onboarding helper |
| `scripts/validate-bifurcated-registry.ts` | Create | Registry self-check |
| `docs/how-to-add-a-bifurcated-client.md` | Create | Teammate runbook |
