import { Card, CardTitle, CardContent } from "@/components/ui/card";
import { Stats } from "@/app/lib/dashboard-types";
interface FeesTableProps {
  fees: Stats["fees"];
  title?: string;
}
export function FeesTable({ fees, title }: FeesTableProps) {
  if (!fees || Object.keys(fees).length === 0) {
    return null;
  }
  const formatDisplayValue = (value: string) => {
    if (value === "-" || value === "" || value === undefined || value === null) {
      return "-";
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return "-";
    }
    const absValue = Math.abs(numValue);
    const formattedValue = absValue.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `₹${formattedValue}`;
  };
  const quarterlyYears = Object.keys(fees).sort((a, b) => parseInt(a) - parseInt(b));
  return (
    <Card className="bg-white/50 border-0 p-4">
      <CardTitle className="text-sm sm:text-lg text-black">
        {title || "Quarterly Fees (₹)"}
      </CardTitle>
      <CardContent className="p-0 mt-4">
        <div className="w-full overflow-x-auto">
          <table className="min-w-full border-collapse divide-y">
            <thead className="border-none border-gray-100">
              <tr className="bg-black/5 border-black/5 text-sm">
                <th className="text-right px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[60px]">
                  Year
                </th>
                <th className="text-right px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[80px]">
                  Q1
                </th>
                <th className="text-right px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[80px]">
                  Q2
                </th>
                <th className="text-right px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[80px]">
                  Q3
                </th>
                <th className="text-right px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[80px]">
                  Q4
                </th>
                <th className="text-right px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[80px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {quarterlyYears.map((year) => (
                <tr key={year} className="border-gray-300 text-sm">
                  <td className="px-4 py-3 text-right whitespace-nowrap text-black min-w-[60px]">
                    {year}
                  </td>
                  {["q1", "q2", "q3", "q4", "total"].map((quarter) => {
                    const rawValue = fees[year][quarter as keyof typeof fees[string]];
                    const displayValue = formatDisplayValue(rawValue);
                    return (
                      <td
                        key={quarter}
                        className="px-4 py-3 text-right whitespace-nowrap text-black"
                      >
                        {displayValue}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {quarterlyYears.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-3 px-4 text-black">
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}