import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const ASHIKA_PROP_CONFIG = defineSingleStrategyClient({
  name: "Ashika Prop",
  qcode: "QAC00073",
  strategyName: "Qode Yield Enhancer++",
  inceptionDate: "2026-01-16",
  exposure: "QYE++ Total Portfolio Exposure", // candidates: "QYE+ Total Portfolio Value", "QYE+ Zerodha Total Portfolio"
  profit: "QYE++ Total Portfolio Exposure", // candidates: "QYE+ Total Portfolio Value", "QYE+ Zerodha Total Portfolio"
});
