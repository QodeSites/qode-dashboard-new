import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const ASHIKA_PROP_2_CONFIG = defineSingleStrategyClient({
  name: "Ashika Prop 2",
  qcode: "QAC00093",
  strategyName: "Qode Yield Enhancer++",
  inceptionDate: "2026-03-20",
  exposure: "QYE++ Total Portfolio Exposure", // candidates: "QYE+ Total Portfolio Value", "QYE+ Zerodha Total Portfolio"
  profit: "QYE++ Total Portfolio Exposure", // candidates: "QYE+ Total Portfolio Value", "QYE+ Zerodha Total Portfolio"
});
