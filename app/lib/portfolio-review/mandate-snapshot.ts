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
  /** True when this client has a client_config_values override for
   *  psar_multiplier that differs from the strategy's default — e.g. an
   *  Ashok Jogani HUF-style client on 2.5x while the strategy default is
   *  2x. Drives the "exception" footnote in Sub-Strategy Performance;
   *  applies to PSAR/NPSAR/SPSAR since they all share this one value. */
  psar_is_exception: boolean;
  psar_standard_value: number | null;
  /** Same idea for long_opt_pct, applying to LONG/NLONG/SLONG. */
  long_opt_is_exception: boolean;
  long_opt_standard_value: number | null;
}

export interface SplitOverride extends Partial<SplitConfig> {
  qcode: string;
  strategy: string;
}

export interface ResolveSplitConfigsResult {
  splits: Map<string, SplitConfig>;
  /** Every config_catalog row parented under 'sub_strategy_sections' whose
   *  own resolved "value" is non-null for a given pair, keyed by
   *  `${qcode}|${strategy}` -> `{ configKey -> { value, label, tagSuffix } }`.
   *  This is the generic, catalog-driven side of the sub-strategy tree —
   *  a brand-new config_catalog row here (config_key + tag_suffix + label,
   *  parent_key = 'sub_strategy_sections') plus per-client
   *  client_config_values rows is all a future flag-type strategy needs;
   *  nothing here names "dma" or "overnight_hedge" specifically. Excludes
   *  psar_leverage/psar_multiplier/long_opt_pct even though they are also
   *  reparented under 'sub_strategy_sections' now (for tree consistency) —
   *  those three have tag_suffix = NULL in config_catalog (they were never
   *  given one) and always have real tier-formatting logic in
   *  sub-strategy-performance.ts, so this map only includes catalog rows
   *  that HAVE a tag_suffix, which naturally excludes them without this
   *  code needing to name them. */
  genericSections: Map<
    string,
    Map<string, { value: number; label: string; tagSuffix: string }>
  >;
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

  // The generic, catalog-driven sub-strategy sections (DMA, Overnight Hedge,
  // and anything added later the same way) — every config_catalog row
  // parented under 'sub_strategy_sections' that also has a tag_suffix.
  // psar_leverage/psar_multiplier/long_opt_pct are reparented here too (for
  // tree consistency) but have tag_suffix = NULL, so this filter naturally
  // excludes them without needing to name them — they keep their existing
  // tier-formatting handling in sub-strategy-performance.ts instead.
  const genericCatalogRows = await prisma.config_catalog.findMany({
    where: { parent_key: "sub_strategy_sections", tag_suffix: { not: null } },
    select: { config_key: true, label: true, tag_suffix: true },
  });

  const splits = new Map<string, SplitConfig>();
  const genericSections: ResolveSplitConfigsResult["genericSections"] = new Map();

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

      // psar_multiplier/long_opt_pct have no parent "value" row of their own
      // to multiply through (sub_strategy_sections is a pure grouping node),
      // so their own resolved value IS the chain value — safe to read the
      // override/default detail directly off the own key.
      const psarDetail = ratios.getDetail("psar_multiplier", "value");
      const longOptDetail = ratios.getDetail("long_opt_pct", "value");

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
        psar_is_exception: psarDetail.isOverride && psarDetail.value !== psarDetail.defaultValue,
        psar_standard_value: psarDetail.defaultValue,
        long_opt_is_exception: longOptDetail.isOverride && longOptDetail.value !== longOptDetail.defaultValue,
        long_opt_standard_value: longOptDetail.defaultValue,
      });

      const resolvedGeneric = new Map<
        string,
        { value: number; label: string; tagSuffix: string }
      >();
      for (const row of genericCatalogRows) {
        const value = chain(row.config_key, "value");
        if (value === null) continue;
        resolvedGeneric.set(row.config_key, {
          value,
          label: row.label,
          tagSuffix: row.tag_suffix!,
        });
      }
      if (resolvedGeneric.size > 0) {
        genericSections.set(`${pair.qcode}|${pair.strategy}`, resolvedGeneric);
      }
    }),
  );

  return { splits, genericSections, diagnostics: diagnostics.items };
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
