import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const ANUP_RAMANI_CONFIG = defineSingleStrategyClient({
  name: "Anup Ramani",
  qcode: "QAC00095",
  strategyName: "Scheme QAW++",
  inceptionDate: "2026-04-08",
  exposure: "QAW++ Zerodha Total Portfolio", // candidates: "QAW++ Total Portfolio Value", "QAW++ Zerodha Total Portfolio"
  profit: "QAW++ Zerodha Total Portfolio", // candidates: "QAW++ Total Portfolio Value", "QAW++ Zerodha Total Portfolio"
});
