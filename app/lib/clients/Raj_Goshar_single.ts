import { defineBifurcatedClient } from "../bifurcated-client-builder";

export const RAJ_GOSHAR_CONFIG = defineBifurcatedClient({
  name: "Raj Goshar",
  qcode: "QAC00112",
  schemes: {
    "Scheme QYE++": {
      inceptionDate: "2026-05-26",
      exposure: "QYE++ Zerodha Total Portfolio", // hint: detected "QYE++ Zerodha Total Portfolio"
      profit: "QYE++ Total Portfolio Value",
    },
  },
});
