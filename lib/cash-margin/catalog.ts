/**
 * lib/cash-margin/catalog.ts
 * Loads config_catalog into an in-memory tree.
 *
 * config_catalog is the hierarchy that replaces the hardcoded sleeve
 * constants (QAW_SUB_TAG_SUFFIXES in consolidated.ts, ETF_SYMBOLS in
 * app/lib/internal-utils.ts). `parent_key` is a self-relation, so a ratio can
 * be split into N sub-ratios at any depth by inserting rows -- no code change.
 *
 * Read FRESH per request (no module-level cache): a new config_catalog row
 * must take effect without a deploy. The table is ~24 rows, so this is one
 * cheap query.
 *
 * The catalog is GLOBAL -- it describes what keys can exist, not what any
 * given strategy is configured for. Per-strategy pruning happens against the
 * resolved values (see ratio-resolver.ts), never against this shape.
 */
import { prisma } from "@/lib/prisma";

export interface CatalogNode {
  configKey: string;
  parentKey: string | null;
  label: string;
  /** Mastersheet system_tag suffix, used as `${strategy} ${tagSuffix}`. Null
   *  for pure grouping nodes (equity_book) and for leaves whose actual value
   *  comes from console_equity_holdings by symbol instead. */
  tagSuffix: string | null;
  /** Bare broker symbol as stored in console_equity_holdings, e.g.
   *  "GOLDBEES" (no exchange suffix). Present only on individually
   *  tradeable leaves -- this is the join key for resolveActual(). */
  consoleSymbol: string | null;
  /** Exchange-suffixed ticker, e.g. "GOLDBEES.NS". Reserved for live-price
   *  lookups; not consumed anywhere in cash-margin today (console_equity_
   *  holdings already carries last_price). */
  ltpSymbol: string | null;
  children: CatalogNode[];
}

export interface Catalog {
  roots: CatalogNode[];
  byKey: Map<string, CatalogNode>;
  /** Direct children of a key. Empty for leaves and unknown keys. */
  childrenOf(configKey: string): CatalogNode[];
  /** All leaf descendants of a key, including the key itself when it is a
   *  leaf. Empty for unknown keys. */
  leavesUnder(configKey: string): CatalogNode[];
  /** True when the key exists and has no children. */
  isLeaf(configKey: string): boolean;
}

/**
 * Load the whole catalog and build the tree.
 *
 * Throws on structural corruption rather than silently dropping nodes:
 * a parent_key pointing at a missing config_key, or a parent cycle. Both
 * would otherwise produce a tree that is quietly missing branches, which
 * surfaces downstream as ratios resolving to 0 for no visible reason.
 */
export async function loadCatalog(): Promise<Catalog> {
  const rows = await prisma.config_catalog.findMany({
    select: {
      config_key: true,
      parent_key: true,
      label: true,
      tag_suffix: true,
      console_symbol: true,
      ltp_symbol: true,
    },
  });

  const byKey = new Map<string, CatalogNode>();
  for (const r of rows) {
    byKey.set(r.config_key, {
      configKey: r.config_key,
      parentKey: r.parent_key,
      label: r.label,
      tagSuffix: r.tag_suffix,
      consoleSymbol: r.console_symbol,
      ltpSymbol: r.ltp_symbol,
      children: [],
    });
  }

  const roots: CatalogNode[] = [];
  for (const node of byKey.values()) {
    if (node.parentKey === null) {
      roots.push(node);
      continue;
    }
    const parent = byKey.get(node.parentKey);
    if (!parent) {
      throw new Error(
        `config_catalog: '${node.configKey}' has parent_key '${node.parentKey}' which does not exist`,
      );
    }
    parent.children.push(node);
  }

  // Every node must be reachable from a root. Anything left over is in a
  // parent cycle (a -> b -> a), which the FK alone does not prevent.
  const reachable = new Set<string>();
  const walk = (n: CatalogNode) => {
    reachable.add(n.configKey);
    for (const c of n.children) walk(c);
  };
  for (const r of roots) walk(r);
  if (reachable.size !== byKey.size) {
    const orphaned = [...byKey.keys()].filter((k) => !reachable.has(k));
    throw new Error(
      `config_catalog: parent cycle detected, keys unreachable from any root: ${orphaned.join(", ")}`,
    );
  }

  const childrenOf = (configKey: string): CatalogNode[] =>
    byKey.get(configKey)?.children ?? [];

  const isLeaf = (configKey: string): boolean => {
    const n = byKey.get(configKey);
    return n ? n.children.length === 0 : false;
  };

  const leavesUnder = (configKey: string): CatalogNode[] => {
    const start = byKey.get(configKey);
    if (!start) return [];
    const out: CatalogNode[] = [];
    const collect = (n: CatalogNode) => {
      if (n.children.length === 0) {
        out.push(n);
        return;
      }
      for (const c of n.children) collect(c);
    };
    collect(start);
    return out;
  };

  return { roots, byKey, childrenOf, leavesUnder, isLeaf };
}
