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
      // Mark a scheme as no longer actively trading. The engine still pulls
      // its historical data normally; the dashboard adds an "(Inactive)"
      // suffix in the strategy dropdown + scheme badge, dims the badge, and
      // shows the "data may not be updated regularly" note. Excel export
      // inherits the flag too. Default: false (i.e. active).
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
