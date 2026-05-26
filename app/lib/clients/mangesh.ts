import { defineBifurcatedClient } from "../bifurcated-client-builder";

export const MANGESH_HIRVE_CONFIG = defineBifurcatedClient({
  name: "Mangesh Hirve",
  qcode: "QAC00064",
  schemes: {
    "Scheme QYE++": {
      inceptionDate: "2025-12-09",
      exposure: "QYE++ Zerodha Total Portfolio",
      profit:   "QYE++ Total Portfolio Value",
    },
    "Scheme QAW++": {
      inceptionDate: "2025-11-24",
      exposure: "QAW++ Zerodha Total Portfolio",
      profit:   "QAW++ Zerodha Total Portfolio",
      inactive: true,
    },
  },
});
