import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateFormatter } from "@/app/lib/dashboard-utils";

interface CashFlowTableProps {
  transactions: { date: string; amount: number }[];
  totals: { totalIn: number; totalOut: number; netFlow: number };
  showAccountColumn?: boolean;
  getAccountName?: (t: { date: string; amount: number }) => string | undefined;
}

export function CashFlowTable({
  transactions,
  totals,
  showAccountColumn = false,
  getAccountName,
}: CashFlowTableProps) {
  const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

  if (!transactions || transactions.length === 0) {
    return (
      <div className="text-center py-3 text-gray-900 dark:text-gray-100">
        No cash flow data available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-full text-black">
        <TableHeader>
          <TableRow className="bg-black/5 border-b border-gray-200">
            <TableHead className="py-1 text-left text-xs font-medium uppercase text-black tracking-wider">
              Date
            </TableHead>
            <TableHead className="py-1 text-right text-xs font-medium uppercase text-black tracking-wider">
              Amount (₹)
            </TableHead>
            {showAccountColumn && (
              <TableHead className="py-1 text-left text-xs font-medium uppercase text-black tracking-wider">
                Account
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((t, i) => {
            const acct =
              showAccountColumn && getAccountName
                ? getAccountName(t) || "Unknown"
                : undefined;
            return (
              <TableRow key={`${t.date}-${i}`} className="border-b border-gray-200 dark:border-gray-700">
                <TableCell className="py-2 text-xs">{dateFormatter(t.date)}</TableCell>
                <TableCell
                  className={`py-2 text-xs font-medium text-right ${
                    Number(t.amount) > 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {inr.format(Number(t.amount))}
                </TableCell>
                {showAccountColumn && <TableCell className="py-2 text-xs">{acct}</TableCell>}
              </TableRow>
            );
          })}
          {/* Totals */}
          <TableRow className="border-t border-gray-200 dark:border-gray-700 font-semibold">
            <TableCell className="py-2 text-xs">Total In</TableCell>
            <TableCell className="py-2 text-xs text-right text-green-800 dark:text-green-600">
              {inr.format(totals.totalIn)}
            </TableCell>
            {showAccountColumn && <TableCell />}
          </TableRow>
          <TableRow className="font-semibold">
            <TableCell className="py-2 text-xs">Total Out</TableCell>
            <TableCell className="py-2 text-xs text-right text-red-800 dark:text-red-600">
              {inr.format(totals.totalOut)}
            </TableCell>
            {showAccountColumn && <TableCell />}
          </TableRow>
          <TableRow className="font-semibold">
            <TableCell className="py-2 text-xs">Net Flow</TableCell>
            <TableCell
              className={`py-2 text-xs text-right font-semibold ${
                totals.netFlow >= 0
                  ? "text-green-800 dark:text-green-600"
                  : "text-red-800 dark:text-red-600"
              }`}
            >
              {inr.format(totals.netFlow)}
            </TableCell>
            {showAccountColumn && <TableCell />}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
