import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const AURUS_FUND_CONFIG = defineSingleStrategyClient({
  name: "Aurus Fund",
  qcode: "QAC00098",
  strategyName: "QYE++",
  inceptionDate: "2026-04-07",
  exposure: "QYE++ Total Portfolio Exposure", // candidates: "QYE++ Total Portfolio Exposure", "QYE++ Total Portfolio Value"
  profit: "QYE++ Total Portfolio Exposure", // candidates: "QYE++ Total Portfolio Exposure", "QYE++ Total Portfolio Value"
});
