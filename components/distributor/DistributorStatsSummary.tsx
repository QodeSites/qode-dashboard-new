"use client";

import { Tooltip } from "@/components/ui/tooltip";

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
}

function formatPercent(raw: string): string {
  const num = parseFloat(raw);
  if (Number.isNaN(num)) return "—";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

export function DistributorStatsSummary({
  returnPercent,
}: DistributorStatsSummaryProps) {
  return (
    <div className="flex justify-center overflow-visible">
      <div className="w-full sm:w-1/2 lg:w-1/3 bg-white/50 rounded-md backdrop-blur-sm card-shadow overflow-visible">
        <div className="pt-2 px-5 pb-2 relative flex flex-col h-24">
          <div className="flex items-center justify-center">
            <div className="flex items-center space-x-2">
              <div className="text-sm font-normal text-card-text truncate">
                CAGR
              </div>
              <Tooltip
                side="top"
                sideOffset={8}
                content={
                  <p className="text-xs">
                    * Returns above 1 year are annualised<br />
                    * Returns below 1 year are absolute
                  </p>
                }
              >
                <button className="text-gray-500 hover:text-gray-700 flex items-center">
                  <span className="bg-logo-green rounded-full h-5 w-5 flex items-center justify-center">
                    <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 0a10 10 0 1010 10A10 10 0 0010 0zm0 18a8 8 0 118-8 8 8 0 01-8 8zm1-13H9v2h2zm0 3H9v6h2z" />
                    </svg>
                  </span>
                </button>
              </Tooltip>
            </div>
          </div>
          <div className="mt-4" />
          <div className="flex items-baseline justify-center">
            <div className="flex items-baseline text-3xl font-[500] text-card-text-secondary font-heading">
              {formatPercent(returnPercent)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
