import { defineBifurcatedClient } from "../bifurcated-client-builder";

export const JONA_FASHIONS_LIFESTYLE_LLP_CONFIG = defineBifurcatedClient({
  name: "Jona Fashions & Lifestyle LLP",
  qcode: "QAC00109",
  schemes: {
    "Scheme QAW++": {
      inceptionDate: "2026-05-15",
      exposure: "QAW++ Zerodha Total Portfolio", // hint: detected "QAW++ Zerodha Total Portfolio"
      profit: "QAW++ Zerodha Total Portfolio",
    },
  },
});
