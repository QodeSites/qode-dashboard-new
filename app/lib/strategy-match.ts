export function normalizeStrategy(s: string | null | undefined): string {
  return (s ?? "").replace(/^scheme\s+/i, "").trim().toLowerCase();
}

export function isStrategyInList(list: string[], strategy: string | null | undefined): boolean {
  const target = normalizeStrategy(strategy);
  return target !== "" && list.some((c) => normalizeStrategy(c) === target);
}
