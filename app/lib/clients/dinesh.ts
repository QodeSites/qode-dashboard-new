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
