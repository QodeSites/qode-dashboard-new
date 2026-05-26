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
