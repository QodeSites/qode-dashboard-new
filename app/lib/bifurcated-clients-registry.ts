import type {
  ClientConfig,
  FrozenSchemeData,
} from "./bifurcated-portfolio-utils";
import { ARWANI_CONFIG } from "./clients/arwani";
import { ASHWIN_CONFIG } from "./clients/ashwin";
import { EMPTY_FROZEN_DATA } from "./bifurcated-portfolio-data";
import { MANGESH_HIRVE_CONFIG } from "./clients/mangesh";
import { SHILPA_PODDAR_CONFIG } from "./clients/shilpa";
import { SURESH_SOMANI_CONFIG } from "./clients/suresh";
import { VIKRAM_TRADING_COMPANY_CONFIG } from "./clients/vikram";
import { DINESH_GOEL_CONFIG } from "./clients/dinesh";
import { GRD_CONFIG } from "./clients/grd";
import { ANUP_RAMANI_CONFIG } from "./clients/anup_single";
import { ASHIT_JHAVERI_CONFIG } from "./clients/ashit_jhaveri_single";
import { AURUS_FUND_CONFIG } from "./clients/arus_fund_single";
import { BHARAT_SHAH_CONFIG } from "./clients/bharat_shah_single";
import { DEEPALI_SHUKLA_CONFIG } from "./clients/deepali_shukla_single";
import { DEEPTI_PARIKH_CONFIG } from "./clients/deepti_parikh_single";
import { KARNA_STOCK_BROKING_CONFIG } from "./clients/karan_single";
import { RADIANCE_FPI_CONFIG } from "./clients/radiance_single";
import { SAKSHI_MAHESHWARI_CONFIG } from "./clients/sakshi_single";
import { BAKUL_SHAH_CONFIG } from "./clients/bakul_shah_single";
import { BINACA_LIMITED_CONFIG } from "./clients/binaca_single";
import { NEHA_RAMANI_CONFIG } from "./clients/neha_ramani_single";
import { SSUNEET_KABRA_CONFIG } from "./clients/ssuneet_kabra_single";
import { TRANSGLOBAL_CONFIG } from "./clients/transglobal_single";

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
  // "multi" (default, when absent) = dropdown render with Total Portfolio +
  // per-scheme views. "single" = no dropdown; the dashboard unwraps the one
  // scheme into the existing single-strategy render path.
  renderMode?: "multi" | "single";
  // Only used for renderMode: "single" clients — supplies the StatsCards
  // broker label, since these clients bypass /api/accounts (which is where
  // multi-account/regular clients get their broker from).
  broker?: string;
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
  {
    icode: "QUS00086",
    qcode: "QAC00072",
    displayName: "Suresh Somani",
    config: SURESH_SOMANI_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },
  {
    icode: "QUS00068",
    qcode: "QAC00043",
    displayName: "Vikram Trading Company",
    config: VIKRAM_TRADING_COMPANY_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },
  {
    icode: "QUS00072",
    qcode: "QAC00053",
    displayName: "Dinesh Goel",
    config: DINESH_GOEL_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
  },
  {
    icode: "QUS00106",
    qcode: "QAC00092",
    displayName: "GRD",
    config: GRD_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "radiance",
  },
  {
    icode: "QUS00109",
    qcode: "QAC00095",
    displayName: "Anup Ramani",
    config: ANUP_RAMANI_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00088",
    qcode: "QAC00074",
    displayName: "Ashit Jhaveri",
    config: ASHIT_JHAVERI_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00112",
    qcode: "QAC00098",
    displayName: "Aurus Fund",
    config: AURUS_FUND_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "radiance",
  },
  {
    icode: "QUS00074",
    qcode: "QAC00056",
    displayName: "Bharat Shah",
    config: BHARAT_SHAH_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00110",
    qcode: "QAC00096",
    displayName: "Deepali Shukla",
    config: DEEPALI_SHUKLA_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },

  {
    icode: "QUS0001",
    qcode: "QAC00022",
    displayName: "Deepti Parikh",
    config: DEEPTI_PARIKH_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00111",
    qcode: "QAC00097",
    displayName: "Karna Stock Broking",
    config: KARNA_STOCK_BROKING_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "radiance",
  },
  {
    icode: "QUS00080",
    qcode: "QAC00065",
    displayName: "Radiance FPI",
    config: RADIANCE_FPI_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "radiance",
  },
  {
    icode: "QUS00084",
    qcode: "QAC00069",
    displayName: "Sakshi Maheshwari",
    config: SAKSHI_MAHESHWARI_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00115",
    qcode: "QAC00101",
    displayName: "Bakul Shah",
    config: BAKUL_SHAH_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00121",
    qcode: "QAC00107",
    displayName: "Binaca Limited",
    config: BINACA_LIMITED_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "radiance",
  },
  {
    icode: "QUS00116",
    qcode: "QAC00102",
    displayName: "Neha Ramani",
    config: NEHA_RAMANI_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00120",
    qcode: "QAC00106",
    displayName: "Ssuneet Kabra",
    config: SSUNEET_KABRA_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "radiance",
  },
  {
    icode: "QUS00117",
    qcode: "QAC00103",
    displayName: "Transglobal",
    config: TRANSGLOBAL_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "radiance",
  },
];

export function findByIcode(icode: string): BifurcatedClientEntry | undefined {
  return BIFURCATED_CLIENTS.find((c) => c.icode === icode);
}

export function findByQcode(qcode: string): BifurcatedClientEntry | undefined {
  return BIFURCATED_CLIENTS.find((c) => c.qcode === qcode);
}
