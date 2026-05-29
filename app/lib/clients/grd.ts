import { defineSingleStrategyClient } from "../bifurcated-client-builder";

// GRD: single-strategy managed/Radiance account sourced from
// bifurcated_master_sheet_test. Renders in the no-dropdown single-strategy
// format (renderMode: "single" in the registry). Radiance convention uses
// the "Total Portfolio Exposure" tag for both exposure and profit.
//
// strategyName is the friendly display label shown in the strategy pill —
// matches what the legacy ZerodhaManagedStrategy showed via strategyNameMap
// ("QYE++" -> "Qode Yield Enhancer++"). It is purely a label/response key;
// the actual DB tags are exposure/profit below.
export const GRD_CONFIG = defineSingleStrategyClient({
  name: "GRD",
  qcode: "QAC00092",
  strategyName: "Qode Yield Enhancer++",
  inceptionDate: "2026-03-11",
  exposure: "QYE++ Total Portfolio Exposure",
  profit: "QYE++ Total Portfolio Exposure",
});
