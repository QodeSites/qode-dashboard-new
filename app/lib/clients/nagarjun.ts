import { defineBifurcatedClient } from "../bifurcated-client-builder";

export const NAGARJUN_TEXTILES_INDIA_CONFIG = defineBifurcatedClient({
  name: "Nagarjun Textiles India",
  qcode: "QAC00123",
  schemes: {
    "Scheme QAW++": {
      inceptionDate: "2026-06-25",
      exposure: "QAW++ Zerodha Total Portfolio",  // hint: detected "QAW++ Zerodha Total Portfolio"
      profit:   "QAW++ Zerodha Total Portfolio",
    },
    "Scheme QYE++": {
      inceptionDate: "2026-06-25",
      exposure: "QYE++ Zerodha Total Portfolio",  // hint: detected "QYE++ Zerodha Total Portfolio"
      profit:   "QYE++ Total Portfolio Value",
    },
  },
});
