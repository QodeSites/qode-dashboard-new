/**
 * app/lib/portfolio-review/ratio-catalog.ts
 * Loads config_catalog into an in-memory tree — Portfolio-Review-owned copy of
 * lib/cash-margin/catalog.ts, trimmed to what split-ratio resolution needs
 * (configKey/parentKey/children only). No consoleSymbol/ltpSymbol/tagSuffix —
 * Portfolio Review never resolves a holdings-actual side, only target ratios.
 *
 * Deliberately a separate copy, not a shared import: Cash-Margin and
 * Portfolio Review are independent features that happen to read the same
 * config_catalog table (see docs/portfolio-review-cash-margin-deploy-relationship.md),
 * not shared code.
 *
 * Read fresh per request (no module-level cache) — config_catalog is ~26
 * rows, cheap to reload, and a new row should take effect without a deploy.
 */
import { prisma } from "@/lib/prisma";

export interface RatioCatalogNode {
  configKey: string;
  parentKey: string | null;
  children: RatioCatalogNode[];
}

export interface RatioCatalog {
  byKey: Map<string, RatioCatalogNode>;
}

/**
 * Load the whole catalog and build the parent/child tree.
 *
 * Throws on structural corruption (parent_key pointing at a missing
 * config_key) rather than silently dropping nodes — a quietly-missing branch
 * would otherwise surface downstream as a ratio resolving to null with no
 * visible reason.
 */
export async function loadRatioCatalog(): Promise<RatioCatalog> {
  const rows = await prisma.config_catalog.findMany({
    select: { config_key: true, parent_key: true },
  });

  const byKey = new Map<string, RatioCatalogNode>();
  for (const r of rows) {
    byKey.set(r.config_key, {
      configKey: r.config_key,
      parentKey: r.parent_key,
      children: [],
    });
  }

  for (const node of byKey.values()) {
    if (node.parentKey === null) continue;
    const parent = byKey.get(node.parentKey);
    if (!parent) {
      throw new Error(
        `config_catalog: '${node.configKey}' has parent_key '${node.parentKey}' which does not exist`,
      );
    }
    parent.children.push(node);
  }

  return { byKey };
}
