import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

const StockTable = ({ holdings, viewMode }: { holdings?: HoldingsSummary; viewMode: "consolidated" | "individual" }) => {
  const [activeTab, setActiveTab] = useState<"all" | "equity" | "debt">("all");
  const [sortBy, setSortBy] = useState<"symbol" | "value" | "pnl">("value");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Currency formatter for INR
const formatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});


  if (!holdings || holdings.holdingsCount === 0) {
    return (
      <Card className="bg-white/50   border-0">
        <CardHeader>
          <CardTitle className="text-card-text text-sm sm:text-lg">Current Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-900 dark:text-gray-100">
            No holdings data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const getAllHoldings = () => {
    return [...holdings.equityHoldings, ...holdings.debtHoldings];
  };

  const getFilteredHoldings = () => {
    let filteredHoldings: Holding[] = [];
    
    switch (activeTab) {
      case "equity":
        filteredHoldings = holdings.equityHoldings;
        break;
      case "debt":
        filteredHoldings = holdings.debtHoldings;
        break;
      default:
        filteredHoldings = getAllHoldings();
    }

    // Sort holdings
    return filteredHoldings.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case "symbol":
          comparison = a.symbol.localeCompare(b.symbol);
          break;
        case "value":
          comparison = a.valueAsOfToday - b.valueAsOfToday;
          break;
        case "pnl":
          comparison = a.pnlAmount - b.pnlAmount;
          break;
      }
      
      return sortOrder === "asc" ? comparison : -comparison;
    });
  };

  const filteredHoldings = getFilteredHoldings();

  return (
    <Card className="bg-white/50   border-0">
      <CardHeader>
        <CardTitle className="text-card-text text-sm sm:text-lg">Current Holdings</CardTitle>
        
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {/* <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
            <div className="text-xs text-blue-600 dark:text-blue-400">Total Holdings</div>
            <div className="text-lg font-semibold text-blue-800 dark:text-blue-300">
              {holdings.holdingsCount}
            </div>
          </div> */}
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
            <div className="text-xs text-green-600 dark:text-green-400">Current Value</div>
            <div className="text-lg font-semibold text-green-800 dark:text-green-300">
              {formatter.format(holdings.totalCurrentValue)}
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-900/20 rounded-lg p-3">
            <div className="text-xs text-gray-600 dark:text-gray-400">Buy Value</div>
            <div className="text-lg font-semibold text-gray-800 dark:text-gray-300">
              {formatter.format(holdings.totalBuyValue)}
            </div>
          </div>
          <div className={`rounded-lg p-3 ${holdings.totalPnl >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
            <div className={`text-xs ${holdings.totalPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              Total P&L
            </div>
            <div className={`text-lg font-semibold ${holdings.totalPnl >= 0 ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
              {formatter.format(holdings.totalPnl)} ({holdings.totalPnlPercent.toFixed(2)}%)
            </div>
          </div>
        </div>

        {/* Tabs */}

      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <Table className="min-w-full">
            <TableHeader>
              <TableRow className="bg-black/5 hover:bg-gray-200 border-b border-gray-200 dark:border-gray-700">
                <TableHead className="py-1 text-left text-xs font-medium text-black uppercase tracking-wider">
                  Symbol
                </TableHead>
                <TableHead className="py-1 text-right text-xs font-medium text-black uppercase tracking-wider">
                  Qty
                </TableHead>
                <TableHead className="py-1 text-right text-xs font-medium text-black uppercase tracking-wider">
                  Avg Price
                </TableHead>
                <TableHead className="py-1 text-right text-xs font-medium text-black uppercase tracking-wider">
                  LTP
                </TableHead>
                <TableHead className="py-1 text-right text-xs font-medium text-black uppercase tracking-wider">
                  Current Value
                </TableHead>
                <TableHead className="py-1 text-right text-xs font-medium text-black uppercase tracking-wider">
                  P&L
                </TableHead>
                <TableHead className="py-1 text-right text-xs font-medium text-black uppercase tracking-wider">
                  P&L %
                </TableHead>
                <TableHead className="py-1 text-left text-xs font-medium text-black uppercase tracking-wider">
                  Category
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHoldings.map((holding, index) => (
                <TableRow key={`${holding.symbol}-${holding.exchange}-${index}`} className="border-b border-gray-200 dark:border-gray-700">
                  <TableCell className="py-2 text-xs">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {holding.symbol}
                      </div>
                      <div className="text-gray-500 dark:text-gray-400 text-[10px]">
                        {holding.exchange} • {holding.broker}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right text-gray-700 dark:text-gray-300">
                    {holding.quantity.toLocaleString()}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right text-gray-700 dark:text-gray-300">
                    ₹{holding.avgPrice.toFixed(2)}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right text-gray-700 dark:text-gray-300">
                    ₹{holding.ltp.toFixed(2)}
                  </TableCell>
                  <TableCell className="py-2 text-xs font-medium text-right text-gray-900 dark:text-gray-100">
                    {formatter.format(holding.valueAsOfToday)}
                  </TableCell>
                  <TableCell 
                    className={`py-2 text-xs font-medium text-right ${
                      holding.pnlAmount >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {formatter.format(holding.pnlAmount)}
                  </TableCell>
                  <TableCell 
                    className={`py-2 text-xs font-medium text-right ${
                      holding.percentPnl >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {holding.percentPnl.toFixed(2)}%
                  </TableCell>
                  <TableCell className="py-2 text-xs text-gray-700 dark:text-gray-300">
                    <div className="flex items-center space-x-1">
                      <span className={`px-1 py-0.5 rounded text-[9px] ${
                        holding.debtEquity.toLowerCase() === 'equity' 
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' 
                          : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                      }`}>
                        {holding.debtEquity}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                      {holding.subCategory || 'Others'}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {filteredHoldings.length === 0 && (
          <div className="text-center py-6 text-gray-500 dark:text-gray-400">
            No holdings found for the selected filter.
          </div>
        )}

        {/* Category Breakdown */}
        {Object.keys(holdings.categoryBreakdown).length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Category Breakdown</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(holdings.categoryBreakdown).map(([category, data]) => (
                <div key={category} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                  <div className="text-xs font-medium text-gray-900 dark:text-gray-100">{category}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {data.count} holdings • {formatter.format(data.currentValue)}
                  </div>
                  <div className={`text-xs font-medium ${data.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    P&L: {formatter.format(data.pnl)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StockTable