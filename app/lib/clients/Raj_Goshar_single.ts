import { defineSingleStrategyClient } from "../bifurcated-client-builder";

// Single-strategy client. Must use defineSingleStrategyClient (one scheme, no
// "Total Portfolio" aggregate) — NOT defineBifurcatedClient, which injects a
// "Total Portfolio" entry first and makes the single-strategy view's badge
// read "Total Portfolio" instead of the strategy name.
export const RAJ_GOSHAR_CONFIG = defineSingleStrategyClient({
  name: "Raj Goshar",
  qcode: "QAC00112",
  strategyName: "Qode Yield Enhancer++",
  inceptionDate: "2026-05-26",
  exposure: "QYE++ Zerodha Total Portfolio",
  profit: "QYE++ Total Portfolio Value",
});
