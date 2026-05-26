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
