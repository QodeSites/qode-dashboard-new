import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const BHARAT_SHAH_CONFIG = defineSingleStrategyClient({
  name: "Bharat Shah",
  qcode: "QAC00056",
  strategyName: "Qode Yield Enhancer+",
  inceptionDate: "2025-10-31",
  exposure: "QYE+ Zerodha Total Portfolio", // candidates: "QYE+ Total Portfolio Value", "QYE+ Zerodha Total Portfolio"
  profit: "QYE+ Total Portfolio Value", // candidates: "QYE+ Total Portfolio Value", "QYE+ Zerodha Total Portfolio"
});
