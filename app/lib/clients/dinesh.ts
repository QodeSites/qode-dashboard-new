import { defineBifurcatedClient } from "../bifurcated-client-builder";

// Zerodha QAW++ rolled into PMS QAW00356 (₹1.49 Cr out 09-30 + ₹4.975 Cr out
// 10-07 = ₹6.4654 Cr in on 10-08); QAW++ and QYE++ are PV 0 from 10-13.
// Total Portfolio blends Zerodha + PMS like SSRG's.
export const DINESH_GOEL_CONFIG = defineBifurcatedClient({
  name: "Dinesh Goel",
  qcode: "QAC00053",
  schemes: {
    "Scheme QAW++": {
      inceptionDate: "2026-01-12",
      exposure: "QAW++ Zerodha Total Portfolio", // hint: detected "QAW++ Zerodha Total Portfolio"
      profit: "QAW++ Zerodha Total Portfolio",
      inactive: true,
    },
    "Scheme QYE++": {
      inceptionDate: "2026-04-08",
      exposure: "QYE++ Zerodha Total Portfolio", // hint: detected "QYE++ Zerodha Total Portfolio"
      profit: "QYE++ Total Portfolio Value",
      inactive: true,
    },
    "Scheme QTF+": {
      inceptionDate: "2025-08-26",
      // Data team renamed this scheme's tags from "QTF++ ..." to "QTF+ ..." in
      // bifurcated_master_sheet_test (the old QTF++ tags now have 0 rows).
      exposure: "QTF+ Zerodha Total Portfolio",
      profit: "QTF+ Zerodha Total Portfolio",
      inactive: true,
    },
  },
  // pms_master_sheet also carries this series as 73060 / 14411570 — use QAW00356 only.
  pms: [{ schemeName: "Scheme PMS QAW", accountCode: "QAW00356" }],
  pmsBlendStartOfDayWeights: true,
});
