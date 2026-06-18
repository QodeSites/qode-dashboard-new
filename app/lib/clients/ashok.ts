import { defineBifurcatedClient } from "../bifurcated-client-builder";

// Ashok Jogani HUF: transitioned from single-strategy QAW+ to two parallel
// schemes — QAW++ (active, inception 2026-06-18) plus the wound-down QAW+
// (inactive after 2026-06-16, rolled into QAW++). Total Portfolio is sourced
// from the authoritative "Qode Total Portfolio" curve in
// bifurcated_master_sheet_test.
//
// NOTE: QAW++ data is not yet populated in bifurcated_master_sheet_test as of
// onboarding (slated for 2026-06-18). Run scripts/validate-bifurcated-registry.ts
// and confirm the engine returns QAW++ rows before deploying.
export const ASHOK_JOGANI_HUF_CONFIG = defineBifurcatedClient({
  name: "Ashok Jogani HUF",
  qcode: "QAC00110",
  schemes: {
    "Scheme QAW++": {
      inceptionDate: "2026-06-18",
      exposure: "QAW++ Zerodha Total Portfolio",
      profit: "QAW++ Zerodha Total Portfolio",
    },
    "Scheme QAW+": {
      inceptionDate: "2026-05-22",
      exposure: "QAW+ Zerodha Total Portfolio",
      profit: "QAW+ Zerodha Total Portfolio",
      inactive: true,
    },
  },
});
