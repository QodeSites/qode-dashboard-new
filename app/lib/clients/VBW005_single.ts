import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const VBW005_CONFIG = defineSingleStrategyClient({
  name: "VBW005",
  qcode: "QAC00115",
  strategyName: "Qode Yield Enhancer++",
  inceptionDate: "2026-06-11",
  exposure: "QYE++ Total Portfolio Exposure", // candidates: "QYE++ Total Portfolio Exposure", "QYE++ Total Portfolio Value"
  profit: "QYE++ Total Portfolio Exposure", // candidates: "QYE++ Total Portfolio Exposure", "QYE++ Total Portfolio Value"
});
