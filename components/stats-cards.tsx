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
  fees?: {
    [year: string]: {
      q1: string;
      q2: string;
      q3: string;
      q4: string;
      total: string;
    };
  };
}

interface StatsCardsProps {
  stats: Stats;
  accountType: string;
  broker?: string;
  isTotalPortfolio?: boolean;
  returnViewType?: "percent" | "cash"; // Add this prop
  setReturnViewType?: (type: "percent" | "cash") => void; // Add this prop
  afterFees?: boolean;
  setAfterFees?: (afterFees: boolean) => void;
}

export function StatsCards({ 
  stats, 
  accountType, 
  broker, 
  isTotalPortfolio = false,
  returnViewType = "percent", // Default fallback
  setReturnViewType, // Use the prop instead of local state
  afterFees = false,
  setAfterFees,
}: StatsCardsProps) {
  // For total portfolio, force cash view
  const effectiveReturnViewType = isTotalPortfolio ? "cash" : returnViewType;

  // Compute total fees
  const totalFees = React.useMemo(() => {
    if (!stats.fees || !afterFees) return 0;
    return Object.values(stats.fees).reduce((sum, yearFees) => {
      return sum + parseFloat(yearFees.total || '0');
    }, 0);
  }, [stats.fees, afterFees]);

  const originalTotalProfit = parseFloat(stats.totalProfit);
  const adjustedTotalProfit = originalTotalProfit - totalFees;

  const originalReturnPercent = parseFloat(stats.return);
  const amountDeposited = parseFloat(stats.amountDeposited);
  const adjustedReturnPercent = amountDeposited > 0 ? (adjustedTotalProfit / amountDeposited) * 100 : originalReturnPercent;

  // Function to get card labels based on account type and broker
  const getCardLabels = (accountType: string, broker?: string) => {
    if (accountType.toLowerCase() === 'managed_account' && broker?.toLowerCase() === 'jainam') {
      return {
        amountDeposited: 'Deposit Amount',
        currentExposure: 'Current Exposure',
        return: 'Return',
        totalDividend: 'Total Dividend'
      };
    }

    return {
      amountDeposited: 'Amount Invested',
      currentExposure: 'Current Portfolio Value',
      return: 'Returns',
      totalDividend: 'Total Dividend'
    };
  };

  const labels = getCardLabels(accountType, broker);

  const statItems = [
    {
      name: labels.amountDeposited,
      value: `₹ ${parseFloat(stats.amountDeposited).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: "",
      changeType: "neutral" as const,
      showNote: false,
    },
    {
      name: labels.currentExposure,
      value: `₹ ${parseFloat(stats.currentExposure).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: "",
      changeType: "neutral" as const,
      showNote: false,
    },
    {
      name: labels.return,
      value: effectiveReturnViewType === "percent"
        ? `${(afterFees ? adjustedReturnPercent : originalReturnPercent).toFixed(2)}%`
        : `₹ ${(afterFees ? adjustedTotalProfit : originalTotalProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: effectiveReturnViewType === "cash"
        ? (afterFees ? adjustedReturnPercent : originalReturnPercent) >= 0 
          ? `+${(afterFees ? adjustedReturnPercent : originalReturnPercent).toFixed(2)}%` 
          : `${(afterFees ? adjustedReturnPercent : originalReturnPercent).toFixed(2)}%`
        : (afterFees ? adjustedTotalProfit : originalTotalProfit) >= 0 
          ? `+₹${(afterFees ? adjustedTotalProfit : originalTotalProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
          : `-₹${Math.abs(afterFees ? adjustedTotalProfit : originalTotalProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      changeType: (effectiveReturnViewType === "percent" 
        ? (afterFees ? adjustedReturnPercent : originalReturnPercent) 
        : (afterFees ? adjustedTotalProfit : originalTotalProfit)
      ) >= 0 ? "positive" : "negative",
      showNote: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 overflow-visible">
      {statItems.map((stat, index) => (
        <div key={stat.name} className="bg-white/50 rounded-md overflow-visible card-shadow">
          <div className="pt-2 px-5 pb-2 relative flex flex-col min-h-24">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="text-sm font-normal text-card-text">{stat.name}</div>
                {stat.showNote && !isTotalPortfolio && (
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
              {stat.showNote && !isTotalPortfolio && setReturnViewType && (
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
            </div>

           <p className="flex font-[500] mt-4 text-card-text-secondary text-3xl font-heading">{stat.value}</p>
              
           
          </div>
        </div>
      ))}
    </div>
  );
}