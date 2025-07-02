"use client";

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
}

export function StatsCards({ stats, accountType, broker }: StatsCardsProps) {
  // Function to get card labels based on account type and broker
  const getCardLabels = (accountType: string, broker?: string) => {
    // Special case: managed_account with jainam broker
    if (accountType.toLowerCase() === 'managed_account' && broker?.toLowerCase() === 'jainam') {
      return {
        amountDeposited: 'Deposit Amount',
        currentExposure: 'Current Exposure',
        return: 'Return on Exposure',
        totalProfit: 'Total Profit'
      };
    }

    // Default case for all other account types (managed_account, pms, etc.)
    return {
      amountDeposited: 'Amount Invested',
      currentExposure: 'Current Portfolio Value',
      return: 'Returns',
      totalProfit: 'Total Profit'
    };
  };

  const labels = getCardLabels(accountType, broker);

  const statItems = [
    {
      name: labels.amountDeposited,
      value: `₹${parseFloat(stats.amountDeposited).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: "",
      changeType: "neutral",
    },
    {
      name: labels.currentExposure,
      value: `₹${parseFloat(stats.currentExposure).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: "",
      changeType: "neutral",
    },
    {
      name: labels.return,
      value: `${parseFloat(stats.return).toFixed(2)}%`,
      change: parseFloat(stats.return) >= 0 ? `+${parseFloat(stats.return).toFixed(2)}%` : `${parseFloat(stats.return).toFixed(2)}%`,
      changeType: parseFloat(stats.return) >= 0 ? "positive" : "negative",
    },
    {
      name: labels.totalProfit,
      value: `₹${parseFloat(stats.totalProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: parseFloat(stats.totalProfit) >= 0 ? `+${parseFloat(stats.totalProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${parseFloat(stats.totalProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      changeType: parseFloat(stats.totalProfit) >= 0 ? "positive" : "negative",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {statItems.map((stat) => (
        <div key={stat.name} className="bg-white/70 backdrop-blur-sm overflow-hidden card-shadow ">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-sm font-medium text-card-text-secondary truncate">{stat.name}</div>
              </div>
            </div>
            <div className="mt-1 flex items-baseline justify-between md:block lg:flex">
              <div className="flex items-baseline text-xl font-semibold text-card-text">{stat.value}</div>
              {/* {stat.change && (
                <div
                  className={`inline-flex items-baseline px-2.5 py-0.5 rounded-full text-sm font-medium md:mt-2 lg:mt-0 ${
                    stat.changeType === "positive" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {stat.changeType === "positive" ? (
                    <ArrowUpIcon className="-ml-1 mr-0.5 flex-shrink-0 h-4 w-4 text-green-500" />
                  ) : (
                    <ArrowDownIcon className="-ml-1 mr-0.5 flex-shrink-0 h-4 w-4 text-red-500" />
                  )}
                  <span className="sr-only">{stat.changeType === "positive" ? "Increased" : "Decreased"} by </span>
                  {stat.change}
                </div>
              )} */}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}