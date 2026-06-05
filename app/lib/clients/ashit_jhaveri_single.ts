import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const ASHIT_JHAVERI_CONFIG = defineSingleStrategyClient({
  name: "Ashit Jhaveri",
  qcode: "QAC00074",
  strategyName: "QYE+",
  inceptionDate: "2026-02-13",
  exposure: "QYE+ Zerodha Total Portfolio", // candidates: "QYE+ Total Portfolio Value", "QYE+ Zerodha Total Portfolio"
  profit: "QYE+ Total Portfolio Value", // candidates: "QYE+ Total Portfolio Value", "QYE+ Zerodha Total Portfolio"
});
