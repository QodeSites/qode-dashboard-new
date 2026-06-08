"use client";

import * as React from "react";
import { ArrowUpIcon, ArrowDownIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "../components/ui/tooltip";

interface Stats {
  amountDeposited: string;
  currentExposure: string;
  return: string;
  totalProfit: string;
  trailingReturns: {
    tenDays: string;
    oneMonth: string;
    threeMonths: string;
    sixMonths: string;
    oneYear: string;
    twoYears: string;
    fiveYears: string;
    sinceInception: string;
  };
  drawdown: string;
  equityCurve: { date: string; value: number }[];
  drawdownCurve: { date: string; value: number }[];
  cashFlows:{amount:number,date:string}[]
}

interface StatsCardsProps {
  stats: Stats;
  accountType: string;
  broker?: string;
  isTotalPortfolio?: boolean;
  returnViewType?: "percent" | "cash"; // Add this prop
  setReturnViewType?: (type: "percent" | "cash") => void; // Add this prop
  totalFees?: number;
  hasNavBasedTotalPortfolio?: boolean;
}

export function StatsCards({
  stats,
  accountType,
  broker,
  isTotalPortfolio = false,
  returnViewType = "percent", // Default fallback
  setReturnViewType, // Use the prop instead of local state
  totalFees,
  hasNavBasedTotalPortfolio = false,
}: StatsCardsProps) {
  // Remove the local useState - we now use props
  // const [returnViewType, setReturnViewType] = useState<"percent" | "cash">(isTotalPortfolio ? "cash" : "percent");

  // Total Portfolio normally locks to cash view, but Dinesh/Arwani have a real
  // NAV curve (Qode Total Portfolio tag) so percent is meaningful — let the
  // toggle drive the view in that case.
  const lockToCashView = isTotalPortfolio && !hasNavBasedTotalPortfolio;
  const effectiveReturnViewType = lockToCashView ? "cash" : returnViewType;

  const [showNetOfFees, setShowNetOfFees] = React.useState(false);

  // Function to get card labels based on account type and broker
  const getCardLabels = (accountType: string, broker?: string) => {
    if (accountType.toLowerCase() === 'managed_account' && broker?.toLowerCase() === 'jainam') {
      return {
      amountDeposited: 'Capital Invested',
      amountWithdrawn:"Capital Withdrawn",
        currentExposure: 'Current Exposure',
        return: 'Return on Exposure',
        totalDividend: 'Total Dividend'
      };
    }

    return {
      amountDeposited: 'Capital Invested',
      amountWithdrawn:"Capital Withdrawn",
      currentExposure: 'Current Portfolio Value',
      return: 'Returns',
      totalDividend: 'Total Dividend'
    };
  };

  function getCashInOut(stats:Stats):{cashOut:number,cashIn:number}
  {
    let cashOut=0,cashIn=0;
    stats.cashFlows.forEach(cash => {
        cash.amount<0 ? cashOut+= cash.amount: cashIn+=cash.amount;
    });    
    cashOut*=-1; // making cash flow positive
    return {cashOut,cashIn};
  }
  
  const labels = getCardLabels(accountType, broker);  
  const statItems = [
    {
      name: labels.amountDeposited,
      value: `₹ ${parseFloat(getCashInOut(stats).cashIn.toString()).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: "",
      changeType: "neutral",
      showNote: false,
    },
    {
      name: labels.amountWithdrawn,
      value: `₹ ${parseFloat(getCashInOut(stats).cashOut.toString()).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: "",
      changeType: "neutral",
      showNote: false,
    },
    {
      name: labels.currentExposure,
      value: `₹ ${parseFloat(stats.currentExposure).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: "",
      changeType: "neutral",
      showNote: false,
    },
    {
      name: labels.return,
      value: effectiveReturnViewType === "percent"
        ? `${parseFloat(stats.return).toFixed(2)}%`
        : (() => {
            const gross = parseFloat(stats.totalProfit);
            const display = showNetOfFees && totalFees ? gross - totalFees : gross;
            return `₹ ${display.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          })(),
      change: effectiveReturnViewType === "cash"
        ? parseFloat(stats.return) >= 0 ? `+${parseFloat(stats.return).toFixed(2)}%` : `${parseFloat(stats.return).toFixed(2)}%`
        : parseFloat(stats.totalProfit) >= 0 ? `+₹${parseFloat(stats.totalProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `-₹${parseFloat(stats.totalProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      changeType: parseFloat(effectiveReturnViewType === "percent" ? stats.return : stats.totalProfit) >= 0 ? "positive" : "negative",
      showNote: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 overflow-visible">
      {statItems.map((stat, index) => (
        <div key={stat.name} className="bg-white/50 rounded-md backdrop-blur-sm card-shadow overflow-visible">
          <div className="pt-2 px-5 pb-2 relative flex flex-col h-24">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="text-sm font-normal text-card-text truncate">{stat.name}</div>
                {stat.showNote && !lockToCashView && (
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
                )}
              </div>
              {stat.showNote && !lockToCashView && setReturnViewType && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setReturnViewType("cash")}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      effectiveReturnViewType === "cash"
                        ? "bg-button-text text-logo-green"
                        : "text-button-text bg-logo-green"
                    }`}
                  >
                    Value
                  </button>
                  <button
                    onClick={() => setReturnViewType("percent")}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      effectiveReturnViewType === "percent"
                        ? "bg-button-text text-logo-green"
                        : "text-button-text bg-logo-green"
                    }`}
                  >
                    Percentage
                  </button>
                </div>
              )}
              {stat.showNote && isTotalPortfolio && totalFees != null && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowNetOfFees(false)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      !showNetOfFees
                        ? "bg-button-text text-logo-green"
                        : "text-button-text bg-logo-green"
                    }`}
                  >
                    Gross
                  </button>
                  <button
                    onClick={() => setShowNetOfFees(true)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      showNetOfFees
                        ? "bg-button-text text-logo-green"
                        : "text-button-text bg-logo-green"
                    }`}
                  >
                    Net
                  </button>
                </div>
              )}
            </div>
            <div className="mt-4" />
              <div
                className={`flex items-baseline text-3xl font-[500] font-heading ${
                  stat.changeType === "negative" ? "text-red-600" : "text-card-text-secondary"
                }`}
              >
                {stat.value}
              </div>
          </div>
        </div>
      ))}
    </div>
  );
}