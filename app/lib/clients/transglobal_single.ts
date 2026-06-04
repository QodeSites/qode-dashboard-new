import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const TRANSGLOBAL_CONFIG = defineSingleStrategyClient({
  name: "Transglobal",
  qcode: "QAC00103",
  strategyName: "Qode Yield Enhancer++",
  inceptionDate: "2026-04-20",
  exposure: "QYE++ Total Portfolio Exposure", // candidates: "QYE++ Total Portfolio Exposure", "QYE++ Total Portfolio Value"
  profit: "QYE++ Total Portfolio Exposure", // candidates: "QYE++ Total Portfolio Exposure", "QYE++ Total Portfolio Value"
});
