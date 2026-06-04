// Standalone builder for the Arwani/Ashwin "multi-parallel-active-schemes"
// pattern. Lives in its own file so that clients/arwani.ts and
// clients/ashwin.ts can import defineBifurcatedClient WITHOUT pulling in
// bifurcated-portfolio-utils (which in turn imports bifurcated-clients-registry
// which imports the client files — creating a circular dep).
//
// bifurcated-portfolio-utils re-exports everything from here for backward compat.

// ==================== Types (shared subset — no Prisma/engine imports) ====================

interface SchemeTagConfig {
  depositTag: string;
  navTag: string;
  startDate: Date;
}

export interface PortfolioConfig {
  current: string;
  metrics: string;
  nav: string;
  isActive: boolean;
  tags?: SchemeTagConfig;
  displayAmountInvestedAsZero?: boolean;
}

export interface ClientConfig {
  clientName: string;
  defaultQcode: string;
  accountCode: string;
  oldSchemeName: string;
  newSchemeName: string;
  oldFinalNav: number;
  newStartDate: Date;
  depositSystemTag: string;
  navSystemTag: string;
  oldSchemeDepositTag: string;
  oldSchemeNavTag: string;
  qodeTotalPortfolioTag?: string;
  portfolioMapping: Record<string, PortfolioConfig>;
}

export interface DefineBifurcatedClientInput {
  name: string;
  qcode: string;
  schemes: Record<
    string,
    {
      inceptionDate: string; // YYYY-MM-DD
      exposure: string;      // system_tag for current/metrics (the "exposure" tag)
      profit: string;        // system_tag for nav (the "profit" tag)
      // Mark a scheme as no longer actively trading. Two coupled effects:
      //
      //   1. UI inactive markers — "(Inactive)" suffix in the strategy
      //      dropdown + scheme badge, dimmed badge (opacity-70), bottom
      //      note "Data may not be updated regularly", Excel export tag.
      //
      //   2. Amount Invested card displays ₹0 instead of the real net
      //      cash flow. This hides closing-withdrawal accounting artifacts
      //      where a retired scheme's net cash flow turned negative
      //      because the grown portfolio rolled out to another scheme
      //      (e.g. Dinesh's QTF → QAW++ migration). Total Portfolio
      //      aggregation is NOT affected — it still counts the real cash
      //      flows under the hood.
      //
      // Default: false (i.e. active, amount shown as-is). If you ever need
      // "inactive marker but real amount shown," fall back to the verbose
      // ClientConfig and set isActive: false + displayAmountInvestedAsZero
      // independently.
      inactive?: boolean;
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
      isActive: !scheme.inactive,
      // Inactive schemes default to showing ₹0 in the Amount Invested card
      // (see scheme.inactive comment above).
      displayAmountInvestedAsZero: !!scheme.inactive,
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

// ==================== Helper: defineSingleStrategyClient ====================
// Builds a ClientConfig for a SINGLE-strategy client whose data lives in
// bifurcated_master_sheet_test but which must render in the existing
// single-strategy dashboard format (NO strategy dropdown, no "Total
// Portfolio" aggregate). Produces exactly one scheme key in
// portfolioMapping. qodeTotalPortfolioTag is set only to route the engine's
// msTable getter to bifurcated_master_sheet_test — because there is no
// "Total Portfolio" key in the mapping, the engine's aggregate code paths
// never run, and handleGET returns a single keyed entry.
//
// Use defineBifurcatedClient (not this) for multi-scheme clients that need
// the dropdown + Total Portfolio aggregate.

export interface DefineSingleStrategyClientInput {
  name: string;
  qcode: string;
  strategyName: string;   // the single scheme's display label, e.g. "QYE++"
  inceptionDate: string;  // YYYY-MM-DD
  exposure: string;       // system_tag for current value / deposit / metrics
  profit: string;         // system_tag for the NAV curve
  // Optional overrides — rarely needed.
  qodeTotalPortfolioTag?: string; // default "Qode Total Portfolio" (table routing only)
  accountCode?: string;            // default "" (vestigial)
}

export function defineSingleStrategyClient(
  input: DefineSingleStrategyClientInput
): ClientConfig {
  const portfolioMapping: Record<string, PortfolioConfig> = {
    // NOTE: no "Total Portfolio" entry — exactly one scheme key, so the
    // engine returns a single response key and the frontend renders it via
    // the no-dropdown single-strategy path.
    [input.strategyName]: {
      current: input.exposure,
      metrics: input.exposure,
      nav: input.profit,
      isActive: true,
      tags: {
        depositTag: input.exposure,
        navTag: input.profit,
        startDate: new Date(input.inceptionDate),
      },
    },
  };

  return {
    clientName: input.name,
    defaultQcode: input.qcode,
    accountCode: input.accountCode ?? "",
    oldSchemeName: "__no_old_scheme__",
    newSchemeName: input.strategyName,
    oldFinalNav: 100,
    newStartDate: new Date(input.inceptionDate),
    depositSystemTag: input.exposure,
    navSystemTag: input.exposure,
    oldSchemeDepositTag: "__no_old_deposit_tag__",
    oldSchemeNavTag: "__no_old_nav_tag__",
    qodeTotalPortfolioTag:
      input.qodeTotalPortfolioTag ?? "Qode Total Portfolio",
    portfolioMapping,
  };
}
