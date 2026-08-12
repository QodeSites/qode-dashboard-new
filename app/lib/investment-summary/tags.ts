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
    // Python's resolve_tag_alias (calculations.py:126-143) only ever adds the
    // unprefixed fallback when the tag being resolved is itself one of
    // KNOWN_TAG_ALIASES' canonical names (its `prefix` detection is derived
    // from `base_tag.endswith(canonical)`, which is only true for
    // Liquidbees/Mutual Funds) — every other tag (ZTP, Equity Stock Holdings,
    // Bond, Liquidcase, Misc PnL...) never gets an unprefixed fallback at
    // all, regardless of allowUnprefixedFallback. `aliases.length > 0` here
    // is the exact TS equivalent of that gate, since baseTag is already
    // separated from strategyPrefix (unlike Python's single concatenated
    // string) — `baseTag in KNOWN_TAG_ALIASES` is the same condition.
    if (allowUnprefixedFallback && aliases.length > 0) {
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

/**
 * Port of main.py's `_check_missing_tags` (~line 98-108): for a client's
 * qcode, which of system_tags.yaml's BASE (unprefixed) tag values have NO
 * rows at all in the Mastersheet — "bond_stock_holdings" and "liquidbees"
 * are exempt (main.py's `OPTIONAL_TAGS`), since plenty of real clients
 * legitimately never hold bonds or Liquidbees. Returns the missing tag
 * VALUES (e.g. "Bond Stock Holdings"), not the base_tags.ts keys, matching
 * Python's return shape (`missing.append(tag_val)`).
 */
const OPTIONAL_TAG_KEYS: (keyof BaseSystemTags)[] = ["bondStockHoldings", "liquidbees"];

export async function checkMissingSystemTags(
  qcode: string,
  baseTags: BaseSystemTags,
  asOfDate?: Date,
): Promise<string[]> {
  const existingTags = await mastersheet.getDistinctTags(qcode, asOfDate);
  const missing: string[] = [];
  for (const key of Object.keys(baseTags) as (keyof BaseSystemTags)[]) {
    if (OPTIONAL_TAG_KEYS.includes(key)) continue;
    const tagValue = baseTags[key];
    if (!existingTags.has(tagValue)) missing.push(tagValue);
  }
  return missing;
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
