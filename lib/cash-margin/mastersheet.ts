/**
 * lib/cash-margin/mastersheet.ts
 * Reads per-strategy figures from bifurcated_master_sheet_test (the live
 * mastersheet table -- NOT the stale `master_sheet`).
 *
 * Ported from managed_accounts_analysis/common_report_utils.py
 * (load_mastersheet, get_val, get_exposure, compute_account_summary).
 *
 * The Python version read one client's Excel and looked up rows by
 * "System Tag". Here we load all rows for a qcode at its latest date once and
 * index them by system_tag in memory -- same semantics, one query per client.
 */
import { prisma } from "@/lib/prisma";
import { resolveAccountValueTag } from "./tags";

// Suffix tags (no strategy prefix) that compute_account_summary reads. These
// mirror TAG_SUFFIXES / LIQUIDBEES_TAG in common_report_utils.py.
const SUFFIX = {
  mutualFunds: "Mutual Funds",
  equityStock: "Equity Stock Holdings",
  bondStock: "Bond Stock Holdings",
  liquidcase: "Liquidcase Stock Holdings",
} as const;
const LIQUIDBEES_TAG = "Liquidbees";

export interface MastersheetSnapshot {
  qcode: string;
  date: Date | null;
  /** system_tag -> portfolio_value */
  values: Map<string, number>;
  /** system_tag -> exposure_value */
  exposures: Map<string, number>;
}

export interface AccountSummary {
  accountValue: number;
  mutualFunds: number;
  equityStock: number;
  bondStock: number;
  liquidcase: number;
  cash: number;
}

/**
 * Load the latest-date snapshot of all bifurcated_master_sheet_test rows for a
 * client, indexed by system_tag. Returns an empty snapshot (date null) if the
 * client has no rows at all. Latest date is resolved PER qcode (clients lag
 * independently), matching Python's "max Date in the sheet".
 *
 * @param asOfDate - TEMPORARY, for verifying against frozen managed_accounts_analysis
 *   Excels: when given, resolves the latest snapshot on or before this date
 *   instead of the overall latest. Read-only (findFirst/findMany only), same
 *   as the no-arg path. Remove once verification against the old Excels is
 *   done -- not meant to be a permanent feature.
 */
export async function loadMastersheet(qcode: string, asOfDate?: Date): Promise<MastersheetSnapshot> {
  const latest = await prisma.bifurcated_master_sheet_test.findFirst({
    where: asOfDate ? { qcode, date: { lte: asOfDate } } : { qcode },
    orderBy: { date: "desc" },
    select: { date: true },
  });

  const snapshot: MastersheetSnapshot = {
    qcode,
    date: latest?.date ?? null,
    values: new Map(),
    exposures: new Map(),
  };
  if (!latest?.date) return snapshot;

  const rows = await prisma.bifurcated_master_sheet_test.findMany({
    where: { qcode, date: latest.date },
    select: { system_tag: true, portfolio_value: true, exposure_value: true },
  });

  for (const r of rows) {
    if (!r.system_tag) continue;
    snapshot.values.set(r.system_tag, r.portfolio_value ? Number(r.portfolio_value) : 0);
    snapshot.exposures.set(r.system_tag, r.exposure_value ? Number(r.exposure_value) : 0);
  }
  return snapshot;
}

/** Portfolio Value for a tag (0 if absent). Port of get_val. */
export function getVal(ms: MastersheetSnapshot, tag: string): number {
  return ms.values.get(tag) ?? 0;
}

/** Exposure Value for a tag (0 if absent). Port of get_exposure. */
export function getExposure(ms: MastersheetSnapshot, tag: string): number {
  return ms.exposures.get(tag) ?? 0;
}

/**
 * Port of compute_account_summary. `prefix` is the strategy (e.g. "QYE++");
 * `exposureTagSuffix` resolves the Account Value tag. Cash is the residual:
 * Account Value minus MF, equity, bond, and liquid case.
 */
export function computeAccountSummary(
  ms: MastersheetSnapshot,
  prefix: string,
  exposureTagSuffix: string,
): AccountSummary {
  const tag = (suffix: string) => `${prefix} ${suffix}`;
  const accountValue = getVal(ms, resolveAccountValueTag(prefix, exposureTagSuffix));
  const mutualFunds = getVal(ms, tag(SUFFIX.mutualFunds));
  const equityStock = getVal(ms, tag(SUFFIX.equityStock));
  const bondStock = getVal(ms, tag(SUFFIX.bondStock));
  const liquidcase = getVal(ms, tag(SUFFIX.liquidcase)) + getVal(ms, LIQUIDBEES_TAG);
  const cash = accountValue - mutualFunds - equityStock - bondStock - liquidcase;
  return { accountValue, mutualFunds, equityStock, bondStock, liquidcase, cash };
}
