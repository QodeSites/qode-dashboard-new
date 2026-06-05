import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const ASHOK_JOGANI_HUF_CONFIG = defineSingleStrategyClient({
  name: "Ashok Jogani HUF",
  qcode: "QAC00110",
  strategyName: "Qode All Weather+",
  inceptionDate: "2026-05-22",
  exposure: "QAW+ Zerodha Total Portfolio", // candidates: "QAW+ Total Portfolio Value", "QAW+ Zerodha Total Portfolio"
  profit: "QAW+ Zerodha Total Portfolio", // candidates: "QAW+ Total Portfolio Value", "QAW+ Zerodha Total Portfolio"
});
