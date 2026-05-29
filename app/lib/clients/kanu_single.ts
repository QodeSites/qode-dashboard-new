import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const KANU_DOSHI_CONFIG = defineSingleStrategyClient({
  name: "Kanu Doshi",
  qcode: "QAC00111",
  strategyName: "Qode Yield Enhancer+",
  inceptionDate: "2026-05-21",
  exposure: "QYE+ Total Portfolio Value", // candidates: "QYE+ Total Portfolio Value", "QYE+ Zerodha Total Portfolio"
  profit: "QYE+ Total Portfolio Value", // candidates: "QYE+ Total Portfolio Value", "QYE+ Zerodha Total Portfolio"
});
