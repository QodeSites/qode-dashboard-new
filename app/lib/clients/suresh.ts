import { defineBifurcatedClient } from "../bifurcated-client-builder";

export const SURESH_SOMANI_CONFIG = defineBifurcatedClient({
  name: "Suresh Somani",
  qcode: "QAC00072",
  schemes: {
    "Scheme QYE++": {
      inceptionDate: "2026-04-01",
      exposure: "QYE++ Zerodha Total Portfolio",
      profit: "QYE++ Total Portfolio Value",
    },
    "Scheme QYE+": {
      inceptionDate: "2026-01-20",
      exposure: "QYE+ Zerodha Total Portfolio",
      profit: "QYE+ Total Portfolio Value",
      inactive: true,
    },
  },
});
