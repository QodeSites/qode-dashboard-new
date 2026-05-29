import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const KARNA_STOCK_BROKING_CONFIG = defineSingleStrategyClient({
  name: "Karna Stock Broking",
  qcode: "QAC00097",
  strategyName: "Qode Yield Enhancer++",
  inceptionDate: "2026-04-16",
  exposure: "QYE++ Total Portfolio Exposure", // candidates: "QYE++ Total Portfolio Exposure", "QYE++ Total Portfolio Value"
  profit: "QYE++ Total Portfolio Exposure", // candidates: "QYE++ Total Portfolio Exposure", "QYE++ Total Portfolio Value"
});
