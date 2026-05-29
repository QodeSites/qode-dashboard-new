import { defineSingleStrategyClient } from "../bifurcated-client-builder";

// GRD: single-strategy managed/Radiance account sourced from
// bifurcated_master_sheet_test. Renders in the no-dropdown single-strategy
// format (renderMode: "single" in the registry). Radiance convention uses
// the "Total Portfolio Exposure" tag for both exposure and profit.
export const GRD_CONFIG = defineSingleStrategyClient({
  name: "GRD",
  qcode: "QAC00092",
  strategyName: "QYE++",
  inceptionDate: "2026-03-11",
  exposure: "QYE++ Total Portfolio Exposure",
  profit: "QYE++ Total Portfolio Exposure",
});
