/**
 * Port of calculations.py's tag-resolution logic (doc 02) — the
 * highest-risk module to get wrong (doc 04). Do not simplify this to a
 * plain lookup: `allow_unprefixed_fallback=false` is mandatory for any
 * per-strategy lookup on a multi-strategy client — real bugs (Deepti
 * Parikh, Dinesh Goel) were fixed by this exact rule in the Python source.
 *
 * resolve_tag_alias tries, in order:
 *   1. prefixed base tag                 (e.g. "QYE++ Zerodha Total Portfolio")
 *   2. prefixed aliases
 *   3. unprefixed base tag               (only if allowUnprefixedFallback)
 *   4. unprefixed aliases                (only if allowUnprefixedFallback)
 * ...picking the first candidate with a NONZERO value, falling back to the
 * first EXISTING candidate (has rows in the mastersheet) if every candidate
 * is zero, and finally to the primary (first) candidate if nothing exists
 * at all.
 */
import * as mastersheet from "./mastersheet";
import type { BaseSystemTags, ResolvedTag } from "./types";

/**
 * Client-specific spelling variants, ported verbatim from Python's
 * KNOWN_TAG_ALIASES (doc 02) — do not "clean up" or dedupe against
 * system_tags.yaml, these exist because real production data has these
 * exact spellings.
 */
const KNOWN_TAG_ALIASES: Record<string, string[]> = {
  Liquidbees: ["Liquidbees Stock Holdings", "LiquidBees"],
  "Mutual Funds": ["MutualFunds"],
};

function buildCandidates(
  baseTag: string,
  strategyPrefix: string,
  allowUnprefixedFallback: boolean,
): string[] {
  const aliases = KNOWN_TAG_ALIASES[baseTag] ?? [];
  const candidates: string[] = [];

  if (strategyPrefix) {
    candidates.push(`${strategyPrefix}${baseTag}`);
    for (const alias of aliases) candidates.push(`${strategyPrefix}${alias}`);
    if (allowUnprefixedFallback) {
      candidates.push(baseTag);
      for (const alias of aliases) candidates.push(alias);
    }
  } else {
    candidates.push(baseTag);
    for (const alias of aliases) candidates.push(alias);
  }

  return candidates;
}

type Metric = "pnl" | "latestPortfolioValue";

interface ResolveOptions {
  strategyPrefix?: string;
  allowUnprefixedFallback?: boolean;
  asOfDate?: Date;
}

async function resolve(
  qcode: string,
  baseTag: string,
  metric: Metric,
  opts: ResolveOptions,
): Promise<ResolvedTag & { value: number }> {
  const candidates = buildCandidates(baseTag, opts.strategyPrefix ?? "", opts.allowUnprefixedFallback ?? true);
  const existingTags = await mastersheet.getDistinctTags(qcode, opts.asOfDate);

  const evaluated: { tag: string; value: number }[] = [];
  for (const candidate of candidates) {
    if (!existingTags.has(candidate)) continue;
    const value =
      metric === "pnl"
        ? await mastersheet.sumPnl(qcode, candidate, opts.asOfDate)
        : (await mastersheet.getLatest(qcode, candidate, opts.asOfDate))?.value ?? 0;
    evaluated.push({ tag: candidate, value });
  }

  const nonZero = evaluated.find((e) => e.value !== 0);
  if (nonZero) {
    return { tag: nonZero.tag, value: nonZero.value, candidatesTried: candidates, matchedNonZero: true };
  }
  if (evaluated.length > 0) {
    return { tag: evaluated[0].tag, value: evaluated[0].value, candidatesTried: candidates, matchedNonZero: false };
  }
  return { tag: candidates[0], value: 0, candidatesTried: candidates, matchedNonZero: false };
}

/** Alias-aware lifetime PnL sum — Python's sum_pnl(ms, resolve_tag_alias(...)). */
export async function sumPnl(qcode: string, baseTag: string, opts: ResolveOptions = {}): Promise<number> {
  return (await resolve(qcode, baseTag, "pnl", opts)).value;
}

/** Alias-aware latest portfolio value — Python's get_latest_portfolio_value(ms, resolve_tag_alias(...)). */
export async function getLatestPortfolioValue(
  qcode: string,
  baseTag: string,
  opts: ResolveOptions = {},
): Promise<number> {
  return (await resolve(qcode, baseTag, "latestPortfolioValue", opts)).value;
}

/** Exposes which candidate tag actually got used, for debugging/traceability (doc 04 ResolvedTag). */
export async function resolveTagAlias(
  qcode: string,
  baseTag: string,
  opts: ResolveOptions = {},
): Promise<ResolvedTag> {
  const { tag, candidatesTried, matchedNonZero } = await resolve(qcode, baseTag, "latestPortfolioValue", opts);
  return { tag, candidatesTried, matchedNonZero };
}

/** Convenience: resolve every base tag in system_tags.yaml at once for a given strategy prefix. */
export async function resolveAllBaseTags(
  qcode: string,
  baseTags: BaseSystemTags,
  opts: ResolveOptions = {},
): Promise<Record<keyof BaseSystemTags, string>> {
  const entries = await Promise.all(
    (Object.keys(baseTags) as (keyof BaseSystemTags)[]).map(async (key) => {
      const resolved = await resolveTagAlias(qcode, baseTags[key], opts);
      return [key, resolved.tag] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<keyof BaseSystemTags, string>;
}
