import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const SSRG_ADVISORY_LLP_CONFIG = defineSingleStrategyClient({
  name: "SSRG Advisory LLP  ",
  qcode: "QAC00094",
  strategyName: "Qode All Weather+",
  inceptionDate: "2026-03-23",
  exposure: "QAW+ Zerodha Total Portfolio", // candidates: "QAW+ Total Portfolio Value", "QAW+ Zerodha Total Portfolio"
  profit: "QAW+ Zerodha Total Portfolio", // candidates: "QAW+ Total Portfolio Value", "QAW+ Zerodha Total Portfolio"
});
