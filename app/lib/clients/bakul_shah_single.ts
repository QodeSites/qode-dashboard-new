import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const BAKUL_SHAH_CONFIG = defineSingleStrategyClient({
  name: "Bakul Shah",
  qcode: "QAC00101",
  strategyName: "Qode Yield Enhancer+",
  inceptionDate: "2026-05-05",
  exposure: "QYE+ Zerodha Total Portfolio", // candidates: "QYE+ Total Portfolio Value", "QYE+ Zerodha Total Portfolio"
  profit: "QYE+ Total Portfolio Value", // candidates: "QYE+ Total Portfolio Value", "QYE+ Zerodha Total Portfolio"
});
