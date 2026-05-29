import { defineSingleStrategyClient } from "../bifurcated-client-builder";

export const RADIANCE_FPI_CONFIG = defineSingleStrategyClient({
  name: "Radiance FPI",
  qcode: "QAC00065",
  strategyName: "Qode Yield Enhancer++",
  inceptionDate: "2025-11-27",
  exposure: "QYE++ Total Portfolio Exposure", // candidates: "QYE++ Total Portfolio Exposure", "QYE++ Total Portfolio Value"
  profit: "QYE++ Total Portfolio Exposure", // candidates: "QYE++ Total Portfolio Exposure", "QYE++ Total Portfolio Value"
});
