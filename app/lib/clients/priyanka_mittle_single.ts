import { defineSingleStrategyClient } from "../bifurcated-client-builder";

// NOTE: bifurcated_master_sheet_test has no rows for QAC00127 as of onboarding
// (inception 2026-07-20). Run scripts/validate-bifurcated-registry.ts and
// confirm the engine returns QYE+ rows before deploying.
export const PRIYANKA_MITTLE_CONFIG = defineSingleStrategyClient({
  name: "Priyanka Mittle",
  qcode: "QAC00127",
  strategyName: "Qode Yield Enhancer+",
  inceptionDate: "2026-07-20",
  exposure: "QYE+ Zerodha Total Portfolio",
  profit: "QYE+ Total Portfolio Value",
});
