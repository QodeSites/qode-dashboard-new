import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const ANAND_DAMANI_CONFIG = defineSingleStrategyClient({
  name: "Anand Damani",
  qcode: "QAC00108",
  strategyName: "Qode Yield Enhancer++",
  inceptionDate: "2026-05-19",
  exposure: "QYE++ Zerodha Total Portfolio", // candidates: "QYE++ Total Portfolio Value", "QYE++ Zerodha Total Portfolio"
  profit: "QYE++ Total Portfolio Value", // candidates: "QYE++ Total Portfolio Value", "QYE++ Zerodha Total Portfolio"
});
