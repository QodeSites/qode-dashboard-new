/**
 * Port of Python's `calc_profit_redeployment(ms, strategy_rows)` (doc 02
 * "calc_profit_redeployment" section, doc 04 "profit-redeployment.ts").
 *
 * For EVERY strategy row the client has ever held — active AND inactive —
 * computes lifetime profits via `mastersheet.sumPnl`. One output row per
 * input `strategyRows` entry (i.e. per Master_Config.csv config row, not
 * deduped by strategy name): Master_Config.csv already has one row per
 * distinct strategy stint, so this preserves that 1:1 shape.
 *
 * `forProfitTag` on each config row is already the fully-resolved exact
 * system_tag string (e.g. "QYE++ Total Portfolio Value"), so this calls
 * `sumPnl` directly — no tag-alias resolution (tags.ts) involved.
 *
 * Composes with the existing `app/investment-summary/profit-redeployment-overrides.ts`
 * (hardcoded QUS0007/Sarla overrides) exactly as page.tsx does today — this
 * module produces the base numbers only; Sarla/Satidham are out of scope
 * here and stay on separate legacy logic.
 *
 * Read-only: only calls `mastersheet.sumPnl` (an `aggregate()` read).
 */
import { sumPnl } from "./mastersheet";
import type { ClientStrategyConfigRow } from "./types";

/** One row of the Profit Redeployment table (doc 02: `[{strategy, profits, status}]`). */
export interface ProfitRedeploymentRow {
  strategy: string;
  profits: number;
  status: "Active" | "Inactive";
}

/**
 * Computes profit-redeployment rows for every strategy stint the client
 * (identified by `qcode`) has ever had, per `strategyRows` (from
 * `config.getClientConfig(icode)`).
 */
export async function calcProfitRedeployment(
  qcode: string,
  strategyRows: ClientStrategyConfigRow[],
  asOfDate?: Date,
): Promise<ProfitRedeploymentRow[]> {
  return Promise.all(
    strategyRows.map(async (row) => ({
      strategy: row.strategy,
      profits: await sumPnl(qcode, row.forProfitTag, asOfDate),
      status: row.status,
    })),
  );
}
