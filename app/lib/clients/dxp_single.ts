import { defineBifurcatedClient } from "../bifurcated-client-builder";

export const DIAMANTAIRE_EXPORTS_PVT_LTD_CONFIG = defineBifurcatedClient({
  name: "Diamantaire Exports Pvt Ltd",
  qcode: "QAC00119",
  schemes: {
    "Scheme QAW+": {
      inceptionDate: "2026-07-08",
      exposure: "QAW+ Zerodha Total Portfolio", // hint: detected "QAW+ Zerodha Total Portfolio"
      profit: "QAW+ Zerodha Total Portfolio",
      // inactive: true,  // uncomment for retired schemes — adds "(Inactive)" markers AND shows Amount Invested as ₹0
    },
    "Scheme QAW++": {
      inceptionDate: "2026-06-23",
      exposure: "QAW++ Zerodha Total Portfolio", // hint: detected "QAW++ Zerodha Total Portfolio"
      profit: "QAW++ Zerodha Total Portfolio",
      inactive: true, // uncomment for retired schemes — adds "(Inactive)" markers AND shows Amount Invested as ₹0
    },
  },
});
