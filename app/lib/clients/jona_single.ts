import { defineBifurcatedClient } from "../bifurcated-client-builder";

// Jona Fashions & Lifestyle LLP: PMS QAW00171 (2026-04-10, closed 05-14) →
// Zerodha QAW++ (2026-05-15) → PMS QAW00349 (2026-10-06, funded 10-06 / 10-08
// / 10-15 from QAW++, which is PV 0 from 10-13). Total Portfolio blends all
// three like SSRG's.
//
// NOTE: pms_master_sheet also carries both PMS accounts chained into one
// series under 62053 / 14410783. Use the two QAW codes only — adding the
// aliases would double-count PMS.
//
// PMS page: one "Scheme PMS QAW" page chaining QAW00171 → QAW00349 (matches the
// 62053 alias's NAV). Total Portfolio still blends the two accounts separately.
export const JONA_FASHIONS_LIFESTYLE_LLP_CONFIG = defineBifurcatedClient({
  name: "Jona Fashions & Lifestyle LLP",
  qcode: "QAC00109",
  schemes: {
    "Scheme QAW++": {
      inceptionDate: "2026-05-15",
      exposure: "QAW++ Zerodha Total Portfolio",
      profit: "QAW++ Zerodha Total Portfolio",
      inactive: true,
    },
  },
  pms: [
    { schemeName: "Scheme PMS QAW (Old)", accountCode: "QAW00171", inactive: true, hidePage: true },
    {
      schemeName: "Scheme PMS QAW",
      accountCode: "QAW00349",
      pageAccountCodes: ["QAW00171", "QAW00349"],
    },
  ],
  pmsBlendStartOfDayWeights: true,
});
