import { defineBifurcatedClient } from "../bifurcated-client-builder";

// Chandanmal Jain: Zerodha QAW+ (inception 2026-07-10) rolled into PMS
// QAW00335 (₹3.92 Cr in on 2026-10-05). QAW+ has no rows after 2026-10-13.
// Total Portfolio blends Zerodha + PMS like SSRG's.
//
// NOTE: pms_master_sheet may also carry this series under other account codes
// (numeric broker code / "FAMILY") — use QAW00335 only, or PMS is double-counted.
export const CHANDANMAL_JAIN_CONFIG = defineBifurcatedClient({
  name: "Chandanmal Jain",
  qcode: "QAC00124",
  schemes: {
    "Scheme QAW+": {
      inceptionDate: "2026-07-10",
      exposure: "QAW+ Zerodha Total Portfolio",
      profit: "QAW+ Zerodha Total Portfolio",
      inactive: true,
    },
  },
  pms: [{ schemeName: "Scheme PMS QAW", accountCode: "QAW00335" }],
  pmsBlendStartOfDayWeights: true,
});
