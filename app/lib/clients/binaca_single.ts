import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const BINACA_LIMITED_CONFIG = defineSingleStrategyClient({
  name: "Binaca Limited",
  qcode: "QAC00107",
  strategyName: "Qode Yield Enhancer++",
  inceptionDate: "2026-05-08",
  exposure: "QYE++ Total Portfolio Exposure", // candidates: "QYE++ Total Portfolio Exposure", "QYE++ Total Portfolio Value"
  profit: "QYE++ Total Portfolio Exposure", // candidates: "QYE++ Total Portfolio Exposure", "QYE++ Total Portfolio Value"
});
