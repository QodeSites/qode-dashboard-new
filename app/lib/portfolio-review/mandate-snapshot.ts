import { prisma } from "@/lib/prisma";
import { toNum } from "@/app/lib/portfolio-review/tags";
import type { StrategyPair } from "@/app/lib/portfolio-review/tags";

export interface SplitConfig {
  equity_pct: number | null;
  debt_pct: number | null;
  lc_pct: number | null;
  cash_pct: number | null;
  gold_pct: number | null;
  lowvol_pct: number | null;
  momentum_pct: number | null;
  psar_leverage: number | null;
  psar_multiplier: number | null;
  long_opt_pct: number | null;
  gold_model_pct: number | null;
  momentum_model_pct: number | null;
  lowvol_model_pct: number | null;
  cash_pct_healthy: number | null;
  liquidcase_pct_gate: number | null;
}

export interface SplitOverride extends Partial<SplitConfig> {
  qcode: string;
  strategy: string;
}

export async function resolveSplitConfigs(
  pairs: StrategyPair[],
): Promise<Map<string, SplitConfig>> {
  const defaults = await prisma.strategy_defaults.findMany();
  const defaultMap = new Map(defaults.map((d) => [d.strategy_name, d]));

  const result = new Map<string, SplitConfig>();
  for (const pair of pairs) {
    const def = defaultMap.get(pair.strategy);
    result.set(`${pair.qcode}|${pair.strategy}`, {
      equity_pct: pair.equity_pct ?? toNum(def?.equity_pct),
      debt_pct: pair.debt_pct ?? toNum(def?.debt_pct),
      lc_pct: pair.lc_pct ?? toNum(def?.lc_pct),
      cash_pct: pair.cash_pct ?? toNum(def?.cash_pct),
      gold_pct: pair.gold_pct ?? toNum(def?.gold_pct),
      lowvol_pct: pair.lowvol_pct ?? toNum(def?.lowvol_pct),
      momentum_pct: pair.momentum_pct ?? toNum(def?.momentum_pct),
      psar_leverage: pair.psar_leverage ?? toNum(def?.psar_leverage),
      psar_multiplier: pair.psar_multiplier ?? toNum(def?.psar_multiplier),
      long_opt_pct: pair.long_opt_pct ?? toNum(def?.long_opt_pct),
      gold_model_pct: pair.gold_model_pct ?? toNum(def?.gold_model_pct),
      momentum_model_pct:
        pair.momentum_model_pct ?? toNum(def?.momentum_model_pct),
      lowvol_model_pct: pair.lowvol_model_pct ?? toNum(def?.lowvol_model_pct),
      cash_pct_healthy: pair.cash_pct_healthy ?? toNum(def?.cash_pct_healthy),
      liquidcase_pct_gate:
        pair.liquidcase_pct_gate ?? toNum(def?.liquidcase_pct_gate),
    });
  }
  return result;
}

const COMPONENT_TAGS = [
  "Mutual Funds",
  "Equity Stock Holdings",
  "Bond Stock Holdings",
  "Liquidcase Stock Holdings",
  "Gold Stock Holdings",
  "Low Vol Stock Holdings",
  "Momentum Stock Holdings",
] as const;

export async function fetchLatestTagValues(
  pairs: StrategyPair[],
): Promise<Map<string, number>> {
  const qcodes: string[] = [];
  const tags: string[] = [];
  for (const p of pairs) {
    qcodes.push(p.qcode);
    tags.push(p.tag);
    for (const comp of COMPONENT_TAGS) {
      qcodes.push(p.qcode);
      tags.push(`${p.strategy} ${comp}`);
    }
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT DISTINCT ON (b.qcode, b.system_tag) b.qcode, b.system_tag, b.portfolio_value
     FROM bifurcated_master_sheet_test b
     JOIN unnest($1::text[], $2::text[]) AS v(qcode, tag)
       ON b.qcode = v.qcode AND b.system_tag = v.tag
     WHERE b.portfolio_value IS NOT NULL
     ORDER BY b.qcode, b.system_tag, b.date DESC`,
    qcodes,
    tags,
  );

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(`${row.qcode}|${row.system_tag}`, Number(row.portfolio_value) || 0);
  }
  return map;
}
