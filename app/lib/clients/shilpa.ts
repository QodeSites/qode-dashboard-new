import { defineBifurcatedClient } from "../bifurcated-client-builder";

export const SHILPA_PODDAR_CONFIG = defineBifurcatedClient({
  name: "Shilpa Poddar",
  qcode: "QAC00040",
  schemes: {
    "Scheme QYE++": {
      inceptionDate: "2026-02-05",
      exposure: "QYE++ Zerodha Total Portfolio",
      profit:   "QYE++ Total Portfolio Value",
    },
    "Scheme QYE+": {
      inceptionDate: "2025-06-25",
      exposure: "QYE+ Zerodha Total Portfolio",
      profit:   "QYE+ Total Portfolio Value",
      inactive: true, 
    },
  },
});
