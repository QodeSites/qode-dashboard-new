import { defineBifurcatedClient } from "../bifurcated-client-builder";

// Deepti Parikh: Zerodha QYE++ (2024-10-14, closed 2026-08-28 with ₹9.8 Cr
// withdrawn), then PMS Growth Fund QGF00364 (₹2 Cr from 2026-09-29). Total
// Portfolio blends both like SSRG's.
//
// NOTE: pms_master_sheet also carries this series as 73482 / 14411605 — use
// QGF00364 only.
export const DEEPTI_PARIKH_CONFIG = defineBifurcatedClient({
  name: "Deepti Parikh",
  qcode: "QAC00022",
  schemes: {
    "Scheme QYE++": {
      inceptionDate: "2024-10-14",
      exposure: "QYE++ Zerodha Total Portfolio", // candidates: "QYE++ Total Portfolio Value", "QYE++ Zerodha Total Portfolio"
      profit: "QYE++ Total Portfolio Value", // candidates: "QYE++ Total Portfolio Value", "QYE++ Zerodha Total Portfolio"
      inactive: true,
    },
  },
  // "Qode Total Portfolio" only starts 2025-03-07 (QYE++ starts 2024-10-14).
  // With one Zerodha scheme, its own NAV is the Zerodha curve — matches Qode
  // TP to 0.005pp where both exist. Only the PMS blend reads this here.
  qodeTotalPortfolioTag: "QYE++ Total Portfolio Value",
  pms: [{ schemeName: "Scheme PMS QGF", accountCode: "QGF00364" }],
  pmsBlendStartOfDayWeights: true,
});
