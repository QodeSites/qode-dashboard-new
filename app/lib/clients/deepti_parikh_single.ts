import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const DEEPTI_PARIKH_CONFIG = defineSingleStrategyClient({
  name: "Deepti Parikh",
  qcode: "QAC00022",
  strategyName: "Qode Yield Enhancer++",
  inceptionDate: "2024-10-14",
  exposure: "QYE++ Zerodha Total Portfolio", // candidates: "QYE++ Total Portfolio Value", "QYE++ Zerodha Total Portfolio"
  profit: "QYE++ Total Portfolio Value", // candidates: "QYE++ Total Portfolio Value", "QYE++ Zerodha Total Portfolio"
});
