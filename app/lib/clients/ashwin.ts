import { defineBifurcatedClient } from "../bifurcated-client-builder";

// Ashwin Agarwal: two parallel active schemes (QYE++ since 2026-02-24,
// QAW++ added 2026-05-04) and an authoritative Qode Total Portfolio
// aggregate curve. No inactive scheme.
export const ASHWIN_CONFIG = defineBifurcatedClient({
  name: "Ashwin Agarwal",
  qcode: "QAC00083",
  accountCode: "AC13",
  schemes: {
    "Scheme QYE++": {
      inceptionDate: "2026-02-24",
      exposure: "QYE++ Zerodha Total Portfolio",
      profit:   "QYE++ Total Portfolio Value",
    },
    "Scheme QAW++": {
      inceptionDate: "2026-05-04",
      exposure: "QAW++ Zerodha Total Portfolio",
      profit:   "QAW++ Zerodha Total Portfolio",
    },
  },
});
