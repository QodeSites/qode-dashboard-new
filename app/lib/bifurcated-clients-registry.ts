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
import { SSRG_ADVISORY_LLP_CONFIG } from "./clients/SSRG_single";
import { WINRO_COMMERCIAL_CONFIG } from "./clients/winro_single";
import { KANU_DOSHI_CONFIG } from "./clients/kanu_single";
import { ASHOK_JOGANI_HUF_CONFIG } from "./clients/ashok";
import { ANAND_DAMANI_CONFIG } from "./clients/anand_single";
import { JONA_FASHIONS_LIFESTYLE_LLP_CONFIG } from "./clients/jona_single";
import { RAJ_GOSHAR_CONFIG } from "./clients/Raj_Goshar_single";
import { ASHIKA_PROP_CONFIG } from "./clients/ashika_prop1";
import { ASHIKA_PROP_2_CONFIG } from "./clients/ashika_prop2";
import { VBW005_CONFIG } from "./clients/VBW005_single";
import { MSG_PARTNERS_LLP_CONFIG } from "./clients/msg_single";
import { RAGHVENDRA_SINGH_CONFIG } from "./clients/raghav_single";
import { HARSH_MEHTA_CONFIG } from "./clients/harsh_mehta_single";
import { MONICA_MEHTA_CONFIG } from "./clients/monica_mehta_single";
import { SANJAY_MEHTA_CONFIG } from "./clients/sanjay_mehta_single";
import { DIAMANTAIRE_EXPORTS_PVT_LTD_CONFIG } from "./clients/dxp_single";
import { NAGARJUN_TEXTILES_INDIA_CONFIG } from "./clients/nagarjun";
import { CHANDANMAL_JAIN_CONFIG } from "./clients/chandanmal_single";
import { PRIYANKA_MITTLE_CONFIG } from "./clients/priyanka_mittle_single";
import { KRISH_COMMODITIES_INDIA_LLP_CONFIG } from "./clients/krish_commodities_single";
import { VINEET_TIBREWALA_CONFIG } from "./clients/vineet_tibrewala_single";
import { ANANTROOP_FINANCIAL_ADVISORY_SERVICES_CONFIG } from "./clients/anantroop_single";

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
  {
    icode: "QUS00108",
    qcode: "QAC00094",
    displayName: "SSRG Advisory LLP  ",
    config: SSRG_ADVISORY_LLP_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00113",
    qcode: "QAC00099",
    displayName: "Winro Commercial",
    config: WINRO_COMMERCIAL_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "radiance",
  },
  {
    icode: "QUS00125",
    qcode: "QAC00111",
    displayName: "Kanu Doshi",
    config: KANU_DOSHI_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00124",
    qcode: "QAC00110",
    displayName: "Ashok Jogani HUF",
    config: ASHOK_JOGANI_HUF_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    // Now multi-scheme (QAW++ active + QAW+ inactive) → default "multi"
    // renderMode with a Total Portfolio aggregate; no longer single-strategy.
  },
  {
    icode: "QUS00122",
    qcode: "QAC00108",
    displayName: "Anand Damani",
    config: ANAND_DAMANI_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00123",
    qcode: "QAC00109",
    displayName: "Jona Fashions & Lifestyle LLP",
    config: JONA_FASHIONS_LIFESTYLE_LLP_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00126",
    qcode: "QAC00112",
    displayName: "Raj Goshar",
    config: RAJ_GOSHAR_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00087",
    qcode: "QAC00073",
    displayName: "Ashika Prop",
    config: ASHIKA_PROP_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "radiance",
  },
  {
    icode: "QUS00107",
    qcode: "QAC00093",
    displayName: "Ashika Prop 2",
    config: ASHIKA_PROP_2_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "radiance",
  },
  {
    icode: "QUS00129",
    qcode: "QAC00115",
    displayName: "VBW005",
    config: VBW005_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "radiance",
  },
  {
    icode: "QUS00130",
    qcode: "QAC00116",
    displayName: "MSG Partners LLP",
    config: MSG_PARTNERS_LLP_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00131",
    qcode: "QAC00117",
    displayName: "Harsh Mehta",
    config: HARSH_MEHTA_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00132",
    qcode: "QAC00118",
    displayName: "Raghvendra Singh",
    config: RAGHVENDRA_SINGH_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00133",
    qcode: "QAC00119",
    displayName: "Diamantaire Exports Pvt Ltd",
    config: DIAMANTAIRE_EXPORTS_PVT_LTD_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    broker: "zerodha",
  },
  {
    icode: "QUS00135",
    qcode: "QAC00121",
    displayName: "Monica Mehta",
    config: MONICA_MEHTA_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00134",
    qcode: "QAC00120",
    displayName: "Sanjay Mehta",
    config: SANJAY_MEHTA_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00137",
    qcode: "QAC00123",
    displayName: "Nagarjun Textiles India",
    config: NAGARJUN_TEXTILES_INDIA_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    broker: "radiance",
  },
  {
    icode: "QUS00138",
    qcode: "QAC00124",
    displayName: "Chandanmal Jain",
    config: CHANDANMAL_JAIN_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00142",
    qcode: "QAC00127",
    displayName: "Priyanka Mittle",
    config: PRIYANKA_MITTLE_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    // Per the data team's spec. NOTE: accounts.broker for QAC00127 currently
    // reads "radiance" in the DB, which contradicts both the spec and the
    // Zerodha-flavored system tags — worth confirming with the data team.
    broker: "zerodha",
  },
  {
    icode: "QUS00145",
    qcode: "QAC00130",
    displayName: "Krish Commodities India LLP",
    config: KRISH_COMMODITIES_INDIA_LLP_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00146",
    qcode: "QAC00131",
    displayName: "Vineet Tibrewala",
    config: VINEET_TIBREWALA_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
  {
    icode: "QUS00148",
    qcode: "QAC00133",
    displayName: "Anantroop Financial Advisory Services Private Limited",
    config: ANANTROOP_FINANCIAL_ADVISORY_SERVICES_CONFIG,
    frozenData: EMPTY_FROZEN_DATA,
    hasNavBasedTotalPortfolio: true,
    renderMode: "single",
    broker: "zerodha",
  },
];

export function findByIcode(icode: string): BifurcatedClientEntry | undefined {
  return BIFURCATED_CLIENTS.find((c) => c.icode === icode);
}

export function findByQcode(qcode: string): BifurcatedClientEntry | undefined {
  return BIFURCATED_CLIENTS.find((c) => c.qcode === qcode);
}
