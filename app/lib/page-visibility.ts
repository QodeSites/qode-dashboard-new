/**
 * Single source of truth for which client pages are individually gateable
 * via the `dashboard_visibility` table's `page` column. Add a new entry here
 * when a new page should become hideable — no schema change needed, `page`
 * is a free-form string column, not a DB enum.
 *
 * "dashboard" is the original/default page key (pre-existing rows in
 * `dashboard_visibility` migrate forward as `page = 'dashboard'`).
 */
export const PAGE_KEYS = [
  "dashboard",
  "holding-summary",
  "quarterly-fees",
  "personal-details",
] as const;

export type PageKey = (typeof PAGE_KEYS)[number];

export const PAGE_LABELS: Record<PageKey, string> = {
  dashboard: "Portfolio",
  "holding-summary": "Holdings Summary",
  "quarterly-fees": "Costs Summary",
  "personal-details": "Personal Details",
};

export function isPageKey(value: string): value is PageKey {
  return (PAGE_KEYS as readonly string[]).includes(value);
}
