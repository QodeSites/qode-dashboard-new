import { defineBifurcatedClient } from "../bifurcated-client-builder";

// SSRG Advisory LLP: started as single-strategy Zerodha QAW+ (inception
// 2026-03-23), then fully rolled into PMS QAW00353 (inception 2026-09-24) via
// withdrawals on 2026-09-21 / 10-01 / 10-09. QAW+ is inactive (PV 0 from
// 2026-10-09). Total Portfolio blends Zerodha + PMS like Ashok's.
//
// NOTE: pms_master_sheet carries the same SSRG series under three account
// codes (QAW00353, 72780, 14411558). Use QAW00353 only — adding the aliases
// would triple-count PMS.
export const SSRG_ADVISORY_LLP_CONFIG = defineBifurcatedClient({
  name: "SSRG Advisory LLP  ",
  qcode: "QAC00094",
  schemes: {
    "Scheme QAW+": {
      inceptionDate: "2026-03-23",
      exposure: "QAW+ Zerodha Total Portfolio",
      profit: "QAW+ Zerodha Total Portfolio",
      inactive: true,
    },
  },
  pms: [{ schemeName: "Scheme PMS QAW", accountCode: "QAW00353" }],
});
