import { round } from "@/lib/utils";
import { fetchStrategyPairs } from "@/app/lib/portfolio-review/tags";
import {
  resolveSplitConfigs,
  fetchLatestTagValues,
} from "@/app/lib/portfolio-review/mandate-snapshot";
import type { SplitOverride } from "@/app/lib/portfolio-review/mandate-snapshot";

export interface AccountRow {
  qcode: string;
  account_name: string;
  strategy: string;
  total_av: number;
  equity_book: number;
  debt_book: number;
  equity_pct: number | null;
  debt_pct: number | null;
  diff_equity: number | null;
  diff_debt: number | null;
  liquid_case: number;
  cash: number;
  lc_pct: number | null;
  cash_pct: number | null;
  diff_lc: number | null;
  diff_cash: number | null;
}

export interface EquityBreakupRow {
  qcode: string;
  account_name: string;
  strategy: string;
  equity_book: number;
  equity_pct: number | null;
  gold: number;
  lowvol: number;
  momentum: number;
  gold_pct: number | null;
  lowvol_pct: number | null;
  momentum_pct: number | null;
  diff_gold: number | null;
  diff_lowvol: number | null;
  diff_momentum: number | null;
}

export interface AccountValueBreakupResult {
  accounts: AccountRow[];
  equity_breakup: EquityBreakupRow[];
}

export async function computeAccountValueBreakup(
  override?: SplitOverride,
): Promise<AccountValueBreakupResult> {
  const pairs = await fetchStrategyPairs("exposure_tag_suffix");
  if (pairs.length === 0) return { accounts: [], equity_breakup: [] };

  const [valueMap, splitMap] = await Promise.all([
    fetchLatestTagValues(pairs),
    resolveSplitConfigs(pairs),
  ]);

  if (override) {
    const key = `${override.qcode}|${override.strategy}`;
    const base = splitMap.get(key);
    if (!base) {
      throw new Error(
        `No client-strategy pair found for override: ${override.qcode} / ${override.strategy}`,
      );
    }
    splitMap.set(key, {
      equity_pct: override.equity_pct ?? base.equity_pct,
      debt_pct: override.debt_pct ?? base.debt_pct,
      lc_pct: override.lc_pct ?? base.lc_pct,
      cash_pct: override.cash_pct ?? base.cash_pct,
      gold_pct: override.gold_pct ?? base.gold_pct,
      lowvol_pct: override.lowvol_pct ?? base.lowvol_pct,
      momentum_pct: override.momentum_pct ?? base.momentum_pct,
      psar_leverage: base.psar_leverage,
      psar_multiplier: base.psar_multiplier,
      long_opt_pct: base.long_opt_pct,
      gold_model_pct: base.gold_model_pct,
      momentum_model_pct: base.momentum_model_pct,
      lowvol_model_pct: base.lowvol_model_pct,
      cash_pct_healthy: base.cash_pct_healthy,
      liquidcase_pct_gate: base.liquidcase_pct_gate,
    });
  }

  const accounts: AccountRow[] = [];
  const equity_breakup: EquityBreakupRow[] = [];

  for (const pair of pairs) {
    const total = valueMap.get(`${pair.qcode}|${pair.tag}`) ?? 0;
    if (total === 0) continue;

    const split = splitMap.get(`${pair.qcode}|${pair.strategy}`)!;

    const mf = valueMap.get(`${pair.qcode}|${pair.strategy} Mutual Funds`) ?? 0;
    const eqStock =
      valueMap.get(`${pair.qcode}|${pair.strategy} Equity Stock Holdings`) ?? 0;
    const bondStock =
      valueMap.get(`${pair.qcode}|${pair.strategy} Bond Stock Holdings`) ?? 0;
    const equity_book = mf + eqStock + bondStock;
    const debt_book = total - equity_book;

    const equity_pct = equity_book / total;
    const debt_pct = debt_book / total;

    const liquid_case =
      valueMap.get(
        `${pair.qcode}|${pair.strategy} Liquidcase Stock Holdings`,
      ) ?? 0;
    const cash = debt_book - liquid_case;
    const lc_pct = liquid_case / total;
    const cash_pct = cash / total;

    accounts.push({
      qcode: pair.qcode,
      account_name: pair.account_name,
      strategy: pair.strategy,
      total_av: total,
      equity_book,
      debt_book,
      equity_pct: round(equity_pct, 4),
      debt_pct: round(debt_pct, 4),
      diff_equity:
        split.equity_pct != null
          ? round(split.equity_pct - equity_pct, 4)
          : null,
      diff_debt:
        split.debt_pct != null ? round(split.debt_pct - debt_pct, 4) : null,
      liquid_case,
      cash,
      lc_pct: round(lc_pct, 4),
      cash_pct: round(cash_pct, 4),
      diff_lc: split.lc_pct != null ? round(split.lc_pct - lc_pct, 4) : null,
      diff_cash:
        split.cash_pct != null ? round(split.cash_pct - cash_pct, 4) : null,
    });

    if (
      split.gold_pct == null ||
      split.lowvol_pct == null ||
      split.momentum_pct == null
    ) {
      continue;
    }

    const gold =
      valueMap.get(`${pair.qcode}|${pair.strategy} Gold Stock Holdings`) ?? 0;
    const lowvol =
      valueMap.get(`${pair.qcode}|${pair.strategy} Low Vol Stock Holdings`) ??
      0;
    const momentum =
      valueMap.get(`${pair.qcode}|${pair.strategy} Momentum Stock Holdings`) ??
      0;
    const legSum = gold + lowvol + momentum;
    const eqBk = legSum > 0 ? legSum : equity_book;

    const gold_pct = eqBk > 0 ? gold / eqBk : null;
    const lowvol_pct = eqBk > 0 ? lowvol / eqBk : null;
    const momentum_pct = eqBk > 0 ? momentum / eqBk : null;

    equity_breakup.push({
      qcode: pair.qcode,
      account_name: pair.account_name,
      strategy: pair.strategy,
      equity_book: eqBk,
      equity_pct: round(equity_pct, 4),
      gold,
      lowvol,
      momentum,
      gold_pct: gold_pct != null ? round(gold_pct, 4) : null,
      lowvol_pct: lowvol_pct != null ? round(lowvol_pct, 4) : null,
      momentum_pct: momentum_pct != null ? round(momentum_pct, 4) : null,
      diff_gold: gold_pct != null ? round(split.gold_pct - gold_pct, 4) : null,
      diff_lowvol:
        lowvol_pct != null ? round(split.lowvol_pct - lowvol_pct, 4) : null,
      diff_momentum:
        momentum_pct != null
          ? round(split.momentum_pct - momentum_pct, 4)
          : null,
    });
  }

  return { accounts, equity_breakup };
}
