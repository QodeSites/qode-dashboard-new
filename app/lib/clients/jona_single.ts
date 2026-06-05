import { defineSingleStrategyClient } from "../bifurcated-client-builder";

// Single-strategy client. Must use defineSingleStrategyClient (one scheme, no
// "Total Portfolio" aggregate) — NOT defineBifurcatedClient, which injects a
// "Total Portfolio" entry first and makes the single-strategy view's badge
// read "Total Portfolio" instead of the strategy name.
export const JONA_FASHIONS_LIFESTYLE_LLP_CONFIG = defineSingleStrategyClient({
  name: "Jona Fashions & Lifestyle LLP",
  qcode: "QAC00109",
  strategyName: "Qode All Weather++",
  inceptionDate: "2026-05-15",
  exposure: "QAW++ Zerodha Total Portfolio",
  profit: "QAW++ Zerodha Total Portfolio",
});
