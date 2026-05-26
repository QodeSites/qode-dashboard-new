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
