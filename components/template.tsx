import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Transaction {
  date: string;
  amount: number;
}

interface CashFlowTotals {
  totalIn: number;
  totalOut: number;
  netFlow: number;
}

interface PortfolioMetrics {
  amountInvested: number;
  currentPortfolioValue: number;
  returns: number;
}

interface PortfolioReportProps {
  transactions: Transaction[];
  cashFlowTotals: CashFlowTotals;
  metrics?: PortfolioMetrics;
  dateFormatter?: (date: string) => string;
  formatter?: (value: number) => string;
}

const PortfolioReport: React.FC<PortfolioReportProps> = ({
  transactions,
  cashFlowTotals,
  metrics,
  dateFormatter = (date: string) =>
    new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  formatter = (value: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(value),
}) => {
  const safeMetrics: PortfolioMetrics = metrics ?? {
    amountInvested: 0,
    currentPortfolioValue: 0,
    returns: 0,
  };

  return (
    <div className="px-0 py-8 bg-[#EFECD3] min-h-screen text-black">
      <div className="mb-6 text-center">
        <div className="inline-block px-6 py-3 bg-[#02422B] text-[#DABD38] rounded-full font-serif font-bold text-xl">
          Total Portfolio
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <div className="bg-white p-6 border border-black/10 text-center">
          <div className="text-sm sm:text-base text-gray-700 mb-2 uppercase tracking-wide">Amount Invested</div>
          <div className="text-xl sm:text-2xl font-bold">{formatter(safeMetrics.amountInvested)}</div>
        </div>
        <div className="bg-white p-6 border border-black/10 text-center">
          <div className="text-sm sm:text-base text-gray-700 mb-2 uppercase tracking-wide">Current Portfolio Value</div>
          <div className="text-xl sm:text-2xl font-bold">{formatter(safeMetrics.currentPortfolioValue)}</div>
        </div>
        <div className="bg-white p-6 border border-black/10 text-center">
          <div className="text-sm sm:text-base text-gray-700 mb-2 uppercase tracking-wide">Returns</div>
          <div className="text-xl sm:text-2xl font-bold">{formatter(safeMetrics.returns)}</div>
        </div>
      </div>

      <div className="mb-10">
        <h3 className="font-serif text-lg sm:text-xl font-bold mb-4 flex items-center justify-center">
          <span className="w-1 h-6 bg-[#02422B] mr-2"></span>
          Quarterly Profit and Loss (₹)
        </h3>

        <div className="border-b border-black/20">
          <Table className="[&_th]:uppercase [&_th]:tracking-wide [&_th]:text-sm [&_td]:text-base rounded-none">
            <TableHeader>
              <TableRow className="bg-[#02422B] text-[#DABD38] border-b border-black/20">
                <TableHead className="py-4 px-4 text-center">Year</TableHead>
                <TableHead className="py-4 px-4 text-center">Q1</TableHead>
                <TableHead className="py-4 px-4 text-center">Q2</TableHead>
                <TableHead className="py-4 px-4 text-center">Q3</TableHead>
                <TableHead className="py-4 px-4 text-center">Q4</TableHead>
                <TableHead className="py-4 px-4 text-center">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {['2022', '2023', '2024', '2025'].map((y) => (
                <TableRow key={y} className="border-b border-black/10">
                  <TableCell className="py-4 px-4 text-center">{y}</TableCell>
                  <TableCell className="py-4 px-4 text-center">₹0.00</TableCell>
                  <TableCell className="py-4 px-4 text-center">₹0.00</TableCell>
                  <TableCell className="py-4 px-4 text-center">₹0.00</TableCell>
                  <TableCell className="py-4 px-4 text-center">₹0.00</TableCell>
                  <TableCell className="py-4 px-4 text-center">₹0.00</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="mb-10">
        <h3 className="font-serif text-lg sm:text-xl font-bold mb-4 flex items-center justify-center">
          <span className="w-1 h-6 bg-[#02422B] mr-2"></span>
          Cash In/ Cash Out
        </h3>

        <div className="border-b border-black/20">
          <Table className="[&_th]:uppercase [&_th]:tracking-wide [&_th]:text-sm [&_td]:text-base rounded-none">
            <TableHeader>
              <TableRow className="bg-[#02422B] text-[#DABD38] border-b border-black/20">
                <TableHead className="py-4 px-4 text-center">Date</TableHead>
                <TableHead className="py-4 px-4 text-center">Amount (₹)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions?.map((transaction, index) => (
                <TableRow key={`${transaction.date}-${index}`} className="border-b border-black/10">
                  <TableCell className="py-4 px-4 text-center">{dateFormatter(transaction.date)}</TableCell>
                  <TableCell
                    className={`py-4 px-4 text-center font-medium ${
                      Number(transaction.amount) > 0 ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {formatter(Number(transaction.amount))}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-b border-black/20 font-semibold">
                <TableCell className="py-4 px-4 text-center">Total In</TableCell>
                <TableCell className="py-4 px-4 text-center text-green-800">
                  {formatter(cashFlowTotals?.totalIn ?? 0)}
                </TableCell>
              </TableRow>
              <TableRow className="border-b border-black/20 font-semibold">
                <TableCell className="py-4 px-4 text-center">Total Out</TableCell>
                <TableCell className="py-4 px-4 text-center text-red-800">
                  {formatter(cashFlowTotals?.totalOut ?? 0)}
                </TableCell>
              </TableRow>
              <TableRow className="border-b border-black/20 font-semibold">
                <TableCell className="py-4 px-4 text-center">Net Flow</TableCell>
                <TableCell
                  className={`py-4 px-4 text-center font-bold ${
                    (cashFlowTotals?.netFlow ?? 0) >= 0 ? 'text-green-800' : 'text-red-800'
                  }`}
                >
                  {formatter(cashFlowTotals?.netFlow ?? 0)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="bg-white p-6 border-l-4 border-l-[#02422B] border border-black/10 text-center">
        <strong className="text-base">Note:</strong>
        <ul className="list-disc pl-5 mt-2 space-y-1 text-base inline-block text-left">
          <li>Positive numbers represent cash inflows</li>
          <li>Negative numbers represent cash outflows</li>
        </ul>
      </div>
    </div>
  );
};

export default PortfolioReport;