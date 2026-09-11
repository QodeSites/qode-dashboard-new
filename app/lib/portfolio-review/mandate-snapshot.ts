import { prisma } from "@/lib/prisma";
import type { StrategyPair } from "@/app/lib/portfolio-review/tags";
import { loadRatioCatalog } from "@/app/lib/portfolio-review/ratio-catalog";
import {
  loadResolvedRatios,
  resolveChainValue,
  Diagnostics,
} from "@/app/lib/portfolio-review/ratio-resolver";
import type { Diagnostic } from "@/app/lib/portfolio-review/ratio-resolver";

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

export interface ResolveSplitConfigsResult {
  splits: Map<string, SplitConfig>;
  /** Captured for logging only — not (yet) surfaced in any API response. */
  diagnostics: Diagnostic[];
}

/**
 * Resolves each pair's split ratios from the dynamic config system
 * (config_catalog + strategy_config_defaults + client_config_values) instead
 * of the old flat *_pct columns on client_strategy_configs / strategy_defaults.
 * See app/lib/portfolio-review/ratio-resolver.ts for the resolution rule.
 *
 * `referenceDate` pins every row to "as of" that date — pass `new Date()`
 * for today's config, matching what the old undated flat columns always
 * implicitly meant.
 *
 * gold_model_pct / momentum_model_pct / lowvol_model_pct have no equivalent
 * in config_catalog (no "model" ratio_type here — Portfolio Review never
 * reads it, unlike Cash-Margin) and were already always null in practice;
 * they resolve to null unconditionally, same as before.
 */
export async function resolveSplitConfigs(
  pairs: StrategyPair[],
  referenceDate: Date,
): Promise<ResolveSplitConfigsResult> {
  const catalog = await loadRatioCatalog();
  const diagnostics = new Diagnostics();

  const splits = new Map<string, SplitConfig>();

  // One resolve per pair — fine at today's pair counts (~60); revisit with a
  // batched loader if this ever becomes a hot path.
  await Promise.all(
    pairs.map(async (pair) => {
      const ratios = await loadResolvedRatios(
        pair.strategy,
        pair.qcode,
        referenceDate,
      );

      const chain = (
        configKey: string,
        ratioType: "value" | "ideal",
        stopAtKey: string | null = null,
      ) =>
        resolveChainValue(catalog, configKey, ratioType, ratios, diagnostics, stopAtKey);

      splits.set(`${pair.qcode}|${pair.strategy}`, {
        equity_pct: chain("equity_pct", "value"),
        debt_pct: chain("debt_pct", "value"),
        lc_pct: chain("lc_pct", "value"),
        cash_pct: chain("cash_pct", "value"),
        // "ideal" fraction of equity_book only — must not walk further up to
        // equity_book's own parent (equity_pct). See resolveChainValue's header.
        gold_pct: chain("gold", "ideal", "equity_book"),
        lowvol_pct: chain("lowvol", "ideal", "equity_book"),
        momentum_pct: chain("momentum", "ideal", "equity_book"),
        psar_leverage: chain("psar_leverage", "value"),
        psar_multiplier: chain("psar_multiplier", "value"),
        long_opt_pct: chain("long_opt_pct", "value"),
        gold_model_pct: null,
        momentum_model_pct: null,
        lowvol_model_pct: null,
        cash_pct_healthy: chain("cash_pct_healthy", "value"),
        liquidcase_pct_gate: chain("liquidcase_pct_gate", "value"),
      });
    }),
  );

  return { splits, diagnostics: diagnostics.items };
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
