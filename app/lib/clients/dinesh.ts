import { defineBifurcatedClient } from "../bifurcated-client-builder";

export const DINESH_GOEL_CONFIG = defineBifurcatedClient({
  name: "Dinesh Goel",
  qcode: "QAC00053",
  schemes: {
    "Scheme QAW++": {
      inceptionDate: "2026-01-12",
      exposure: "QAW++ Zerodha Total Portfolio", // hint: detected "QAW++ Zerodha Total Portfolio"
      profit: "QAW++ Zerodha Total Portfolio",
    },
    "Scheme QYE++": {
      inceptionDate: "2026-04-08",
      exposure: "QYE++ Zerodha Total Portfolio", // hint: detected "QYE++ Zerodha Total Portfolio"
      profit: "QYE++ Total Portfolio Value",
    },
    "Scheme QTF++": {
      inceptionDate: "2025-08-26",
      exposure: "QTF++ Zerodha Total Portfolio", // hint: detected "QTF++ Zerodha Total Portfolio"
      profit: "QTF++ Zerodha Total Portfolio",
      inactive: true,
    },
  },
});
