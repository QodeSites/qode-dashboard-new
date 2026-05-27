import type {
  ClientConfig,
  FrozenSchemeData,
} from "./bifurcated-portfolio-utils";
import { ARWANI_CONFIG } from "./clients/arwani";
import { ASHWIN_CONFIG } from "./clients/ashwin";
import { EMPTY_FROZEN_DATA } from "./bifurcated-portfolio-data";
import { MANGESH_HIRVE_CONFIG } from "./clients/mangesh";
import { SHILPA_PODDAR_CONFIG } from "./clients/shilpa";

// Single source of truth for clients whose data lives in
// bifurcated_master_sheet_test. Add a new entry here when onboarding a new
// bifurcated client (see docs/how-to-add-a-bifurcated-client.md).
//
// Shilpa and Vikram intentionally NOT in this registry — they still read from
// master_sheet via their own engine instances. They will be added here once
// their data migrates to bifurcated_master_sheet_test.

export interface BifurcatedClientEntry {
  icode: string;
  qcode: string;
  displayName: string;
  config: ClientConfig;
  frozenData: FrozenSchemeData;
  hasNavBasedTotalPortfolio: boolean;
}

export const BIFURCATED_CLIENTS: BifurcatedClientEntry[] = [
  {
    icode: "QUS00085",
    qcode: "QAC00071",
    displayName: "Arwani",
    config: ARWANI_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },
  {
    icode: "QUS00097",
    qcode: "QAC00083",
    displayName: "Ashwin Agarwal",
    config: ASHWIN_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },
  {
    icode: "QUS00079",
    qcode: "QAC00064",
    displayName: "Mangesh Hirve",
    config: MANGESH_HIRVE_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },
  {
    icode: "QUS00067",
    qcode: "QAC00040",
    displayName: "Shilpa Poddar",
    config: SHILPA_PODDAR_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },

];

export function findByIcode(icode: string): BifurcatedClientEntry | undefined {
  return BIFURCATED_CLIENTS.find((c) => c.icode === icode);
}

export function findByQcode(qcode: string): BifurcatedClientEntry | undefined {
  return BIFURCATED_CLIENTS.find((c) => c.qcode === qcode);
}
