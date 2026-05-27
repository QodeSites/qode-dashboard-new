import { defineBifurcatedClient } from "../bifurcated-client-builder";

export const VIKRAM_TRADING_COMPANY_CONFIG = defineBifurcatedClient({
  name: "Vikram Trading Company",
  qcode: "QAC00043",
  schemes: {
    "Scheme QYE++": {
      inceptionDate: "2026-01-14",
      exposure: "QYE++ Zerodha Total Portfolio",
      profit: "QYE++ Total Portfolio Value",
    },
    "Scheme QYE+": {
      inceptionDate: "2025-06-26",
      exposure: "QYE+ Zerodha Total Portfolio",
      profit: "QYE+ Total Portfolio Value",
      inactive: true,
    },
  },
});
