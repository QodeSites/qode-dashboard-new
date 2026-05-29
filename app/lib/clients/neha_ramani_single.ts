import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const NEHA_RAMANI_CONFIG = defineSingleStrategyClient({
  name: "Neha Ramani",
  qcode: "QAC00102",
  strategyName: "Qode All Weather++",
  inceptionDate: "2026-04-30",
  exposure: "QAW++ Zerodha Total Portfolio", // candidates: "QAW++ Total Portfolio Value", "QAW++ Zerodha Total Portfolio"
  profit: "QAW++ Zerodha Total Portfolio", // candidates: "QAW++ Total Portfolio Value", "QAW++ Zerodha Total Portfolio"
});
