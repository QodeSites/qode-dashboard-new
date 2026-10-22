import { defineBifurcatedClient } from "../bifurcated-client-builder";

// Krish Commodities India LLP: Zerodha QAW++ (2026-08-07) rolled into PMS
// QAW00347 (₹1.18 Cr 09-23 → 09-24; ₹3.64 Cr out 10-09 → in 10-12 / 10-16).
// QAW++ is PV 0 from 10-13. Total Portfolio blends Zerodha + PMS like SSRG's.
//
// NAV comes from "Zerodha Total Portfolio": the QAW++ / Qode Total Portfolio
// navs are computed on the ~₹97K left after 10-09 (+125% / −99.95% on
// 10-12 / 10-13). Values + cash stay on the QAW++ tag (withdrawal on 10-09).
//
// NOTE: pms_master_sheet also carries this series as 72550 / 14411537 — use
// QAW00347 only.
export const KRISH_COMMODITIES_INDIA_LLP_CONFIG = defineBifurcatedClient({
  name: "Krish Commodities India LLP",
  qcode: "QAC00130",
  schemes: {
    "Scheme QAW++": {
      inceptionDate: "2026-08-07",
      exposure: "QAW++ Zerodha Total Portfolio",
      profit: "Zerodha Total Portfolio",
      inactive: true,
    },
  },
  qodeTotalPortfolioTag: "Zerodha Total Portfolio",
  pms: [{ schemeName: "Scheme PMS QAW", accountCode: "QAW00347" }],
  pmsBlendStartOfDayWeights: true,
});
