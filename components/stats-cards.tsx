"use client";

import * as React from "react";
import { useState } from "react";
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
}

interface StatsCardsProps {
  stats: Stats;
  accountType: string;
  broker?: string;
  isTotalPortfolio?: boolean; // Add this prop to identify total portfolio view
}

export function StatsCards({ stats, accountType, broker, isTotalPortfolio = false }: StatsCardsProps) {
  // For total portfolio, default to cash view and don't allow percentage view
  const [returnViewType, setReturnViewType] = useState<"percent" | "cash">(isTotalPortfolio ? "cash" : "percent");

  // Function to get card labels based on account type and broker
  const getCardLabels = (accountType: string, broker?: string) => {
    if (accountType.toLowerCase() === 'managed_account' && broker?.toLowerCase() === 'jainam') {
      return {
        amountDeposited: 'Deposit Amount',
        currentExposure: 'Current Exposure',
        return: 'Return on Exposure',
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
      value: `₹${parseFloat(stats.amountDeposited).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: "",
      changeType: "neutral",
      showNote: false,
    },
    {
      name: labels.currentExposure,
      value: `₹${parseFloat(stats.currentExposure).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: "",
      changeType: "neutral",
      showNote: false,
    },
    {
      name: labels.return,
      value: returnViewType === "percent"
        ? `${parseFloat(stats.return).toFixed(2)}%`
        : `₹${parseFloat(stats.totalProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: returnViewType === "percent"
        ? parseFloat(stats.return) >= 0 ? `+${parseFloat(stats.return).toFixed(2)}%` : `${parseFloat(stats.return).toFixed(2)}%`
        : parseFloat(stats.totalProfit) >= 0 ? `+₹${parseFloat(stats.totalProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `-₹${parseFloat(stats.totalProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      changeType: parseFloat(returnViewType === "percent" ? stats.return : stats.totalProfit) >= 0 ? "positive" : "negative",
      showNote: true,
    },
    // {
    //   name: labels.totalDividend,
    //   value: `₹0`,
    //   change: parseFloat(stats.totalProfit) >= 0 ? `+₹${parseFloat(stats.totalProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `-₹${parseFloat(stats.totalProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    //   changeType: parseFloat(stats.totalProfit) >= 0 ? "positive" : "negative",
    //   showNote: false,
    // },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 overflow-visible">
      {statItems.map((stat, index) => (
        <div key={stat.name} className="bg-white/70 rounded-md backdrop-blur-sm card-shadow overflow-visible">
          <div className="p-5 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="text-sm font-normal text-card-text truncate ">{stat.name}</div>
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
              {/* Only show toggle buttons if not total portfolio */}
              {stat.showNote && !isTotalPortfolio && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setReturnViewType("cash")}
                    className={`rounded-full px-3 py-1 text-xs  font-medium transition-colors ${returnViewType === "cash"
                        ? "bg-button-text text-logo-green"
                        : "text-button-text bg-logo-green"
                      }`}
                  >
                    Value
                  </button>
                  <button
                    onClick={() => setReturnViewType("percent")}
                    className={`rounded-full px-3 py-1 text-xs font-medium  transition-colors ${returnViewType === "percent"
                        ? "bg-button-text text-logo-green"
                        : "text-button-text bg-logo-green"
                      }`}
                  >
                    Percentage
                  </button>

                </div>
              )}
            </div>
            <div className="mt-1 flex items-baseline justify-between md:block lg:flex">
              <div className="flex items-baseline text-3xl mt-2 font-[500]  text-card-text-secondary font-heading">
                {stat.value}
                {/* Optional: Uncomment to display stat.change with Inria Serif */}
                {/* {stat.change && (
                  <div className="ml-2 text-sm text-gray-500 font-heading">{stat.change}</div>
                )} */}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}