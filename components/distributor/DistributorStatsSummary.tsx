"use client";

/**
 * Lightweight stats summary for the distributor view.
 *
 * Purposefully avoids the shared `StatsCards` component because that one
 * shows rupee-denominated cards (Amount Invested, Current Portfolio Value)
 * which the distributor view must hide. Building a new small component is
 * safer than adding conditional props to `StatsCards`, which is rendered by
 * many other dashboard surfaces.
 *
 * Visual styling mirrors `components/stats-cards.tsx` so the distributor view
 * feels visually consistent with the regular dashboard.
 */

interface DistributorStatsSummaryProps {
  // Returns over the strategy's inception period, as a percentage string
  // (e.g. "13.57"). Same shape as `Stats.return` from portfolio-utils.
  returnPercent: string;
  // Maximum drawdown over the strategy's history, as a percentage string
  // (e.g. "-2.53"). Same shape as `Stats.drawdown`.
  drawdownPercent: string;
}

function formatPercent(raw: string): string {
  const num = parseFloat(raw);
  if (Number.isNaN(num)) return "—";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

export function DistributorStatsSummary({
  returnPercent,
  drawdownPercent,
}: DistributorStatsSummaryProps) {
  const items = [
    {
      label: "Returns",
      value: formatPercent(returnPercent),
      tooltip: "Annualised for periods over 1 year, absolute for shorter periods.",
    },
    {
      label: "Max Drawdown",
      value: formatPercent(drawdownPercent),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-visible">
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-white/50 rounded-md backdrop-blur-sm card-shadow overflow-visible"
        >
          <div className="pt-2 px-5 pb-2 relative flex flex-col h-24">
            <div className="flex items-center justify-between">
              <div className="text-sm font-normal text-card-text truncate">
                {item.label}
              </div>
            </div>
            <div className="mt-4" />
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline text-3xl font-[500] text-card-text-secondary font-heading">
                {item.value}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
