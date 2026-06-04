import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const WINRO_COMMERCIAL_CONFIG = defineSingleStrategyClient({
  name: "Winro Commercial",
  qcode: "QAC00099",
  strategyName: "Qode Yield Enhancer++",
  inceptionDate: "2026-04-15",
  exposure: "QYE++ Total Portfolio Exposure", // candidates: "QYE++ Total Portfolio Exposure", "QYE++ Total Portfolio Value"
  profit: "QYE++ Total Portfolio Exposure", // candidates: "QYE++ Total Portfolio Exposure", "QYE++ Total Portfolio Value"
});
