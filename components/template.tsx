import React from "react";
import { RevenueChart } from "./revenue-chart";

type ReturnView = "percent" | "cash";

interface Transaction { date: string; amount: number; }
interface CashFlowTotals { totalIn: number; totalOut: number; netFlow: number; }
interface PortfolioMetrics { amountInvested: number; currentPortfolioValue: number; returns: number; }

type CombinedTrailingCell = { portfolio?: string | null; benchmark?: string | null; };
type CombinedTrailing = {
  fiveDays?: CombinedTrailingCell;
  tenDays?: CombinedTrailingCell;
  fifteenDays?: CombinedTrailingCell;
  oneMonth?: CombinedTrailingCell;
  threeMonths?: CombinedTrailingCell;
  sixMonths?: CombinedTrailingCell;
  oneYear?: CombinedTrailingCell;
  twoYears?: CombinedTrailingCell;
  fiveYears?: CombinedTrailingCell;
  sinceInception: CombinedTrailingCell;
  MDD?: CombinedTrailingCell;
  currentDD?: CombinedTrailingCell;
};

interface QuarterlyPnl {
  [year: string]: {
    percent: { q1: string; q2: string; q3: string; q4: string; total: string; };
    cash: { q1: string; q2: string; q3: string; q4: string; total: string; };
    yearCash: string;
  };
}

interface MonthlyPnl {
  [year: string]: {
    months: { [month: string]: { percent: string; cash: string; capitalInOut: string; } };
    totalPercent: number | string;
    totalCash: number;
    totalCapitalInOut: number;
  };
}

interface PortfolioReportProps {
  transactions: Transaction[];
  cashFlowTotals: CashFlowTotals;
  metrics: PortfolioMetrics;
  equityCurve?: { date: string; value: number; }[];
  drawdownCurve?: { date: string; value: number; }[];
  combinedTrailing: CombinedTrailing;
  drawdown?: string;
  monthlyPnl?: MonthlyPnl | null;
  quarterlyPnl?: QuarterlyPnl | null;
  lastDate?: string | null;
  strategyName?: string;
  isTotalPortfolio?: boolean;
  isActive?: boolean;
  returnViewType?: "percent";
  showOnlyQuarterlyCash?: boolean;
  showPmsQawView?: boolean;
  dateFormatter?: (date: string) => string;
  formatter?: (value: number) => string;
}

const defaultDateFmt = (d: string) => new Date(d).toLocaleDateString("en-IN");
const defaultMoneyFmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(v);

const horizonOrder: (keyof CombinedTrailing)[] = [
  "fiveDays", "tenDays", "fifteenDays", "oneMonth", "threeMonths", "oneYear", "twoYears", "sinceInception"
];

const labelMap: Record<string, string> = {
  fiveDays: "5D",
  tenDays: "10D",
  fifteenDays: "15D",
  oneMonth: "1M",
  threeMonths: "3M",
  oneYear: "1Y",
  twoYears: "2Y",
  sinceInception: "Since Inception",
};

/* --------------------------- helpers --------------------------- */
const isNum = (v: unknown) => {
  if (v === null || v === undefined || v === "") return false;
  const n = Number(v);
  return Number.isFinite(n);
};

const hasAnyTrailingData = (tr: CombinedTrailing | undefined) => {
  if (!tr) return false;
  return horizonOrder.some((k) => {
    const c = tr[k] as CombinedTrailingCell | undefined;
    return isNum(c?.portfolio) || isNum(c?.benchmark);
  });
};

const hasDrawdownData = (tr: CombinedTrailing | undefined) => {
  if (!tr) return false;
  return isNum(tr.currentDD?.portfolio) || isNum(tr.currentDD?.benchmark) || isNum(tr.MDD?.portfolio) || isNum(tr.MDD?.benchmark);
};

const hasQuarterlyData = (qp: QuarterlyPnl | null | undefined) => {
  if (!qp) return false;
  const years = Object.keys(qp);
  if (years.length === 0) return false;
  return years.some((y) => {
    const c = qp[y]?.cash;
    return ["q1", "q2", "q3", "q4", "total"].some((k) => isNum((c as any)?.[k]));
  });
};

const hasMonthlyData = (mp: MonthlyPnl | null | undefined, view: ReturnView) => {
  if (!mp) return false;
  const years = Object.keys(mp);
  if (years.length === 0) return false;

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return years.some((y) => {
    const months = mp[y]?.months ?? {};
    const anyMonth = monthNames.some((m) => {
      const rec = (months as any)[m];
      return view === "percent" ? isNum(rec?.percent) : isNum(rec?.cash);
    });
    if (anyMonth) return true;
    if (view === "percent") return isNum(mp[y]?.totalPercent);
    return isNum(mp[y]?.totalCash);
  });
};

const hasTransactions = (tx: Transaction[] | undefined) => Array.isArray(tx) && tx.length > 0;

/* --------------------------- CSS Styles --------------------------- */
const styles = `
  .portfolio-report {
    padding: 0 0 2rem 0;
    background: #EFECD3;
    min-height: 100vh;
    color: #000000;
    font-family: Arial, sans-serif;
  }

  .title-pill {
    margin: 0 auto 1.5rem auto;
    max-width: fit-content;
    text-align: center;
  }

  .title-pill-content {
    padding: 0.5rem 1.5rem;
    background: #02422B;
    color: #DABD38;
    border-radius: 9999px;
    font-family: 'Lato', sans-serif;
    font-weight: 300;
    font-size: 1rem;
    display: inline-block;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .stat-box {
    background: #FFFFFF;
    padding: 1rem;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 6px;
    text-align: center;
  }

  .stat-label {
    font-size: 0.875rem;
    color: #374151;
    margin-bottom: 0.25rem;
    letter-spacing: 0.025em;
  }

  .stat-value {
    font-size: 1.125rem;
    font-weight: 600;
  }

  .section-title {
    font-family: 'Lato', sans-serif;
    font-weight: 100;
    font-size: 1.8rem;
    margin-bottom: 0.75rem;
    text-align: center;
  }

  .table-container {
    width: 100%;
    border-collapse: collapse;
    background: transparent;
    margin-bottom: 1.5rem;
  }

  .table-header {
    background: #02422B;
    color: #DABD38;
    border-bottom: 1px solid rgba(0, 0, 0, 0.2);
  }

  .table-header-cell {
    padding: 8px 12px;
    text-align: center;
    vertical-align: middle;
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    min-width: 80px;
  }

  .table-cell {
    padding: 8px 12px;
    text-align: center;
    vertical-align: middle;
    font-size: 13px;
    font-weight: 400;
  }

  .table-row {
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }

  .note-box {
    background: #FFFFFF;
    border-radius: 6px;
    font-size: 0.875rem;
    margin-bottom: 1.5rem;
    padding: 0.5rem;
    text-align: left;
  }

  .final-note {
    background: #FFFFFF;
    padding: 1rem;
    border-left: 4px solid #02422B;
    border: 1px solid rgba(0, 0, 0, 0.1);
  }

  .positive-value {
    color: #008455;
  }

  .negative-value {
    color: #550e0e;
  }

  @media print {
    .portfolio-report {
      background: white !important;
      color: black !important;
    }
    
    .title-pill-content {
      -webkit-print-color-adjust: exact;
      color-adjust: exact;
    }
    
    .table-header {
      -webkit-print-color-adjust: exact;
      color-adjust: exact;
    }
  }
`;

/* --------------------------- component --------------------------- */
const PortfolioReport: React.FC<PortfolioReportProps> = ({
  transactions,
  cashFlowTotals,
  metrics,
  equityCurve = [],
  drawdownCurve = [],
  combinedTrailing,
  drawdown,
  monthlyPnl,
  quarterlyPnl,
  lastDate,
  strategyName,
  isTotalPortfolio = false,
  isActive = true,
  returnViewType = "percent",
  showOnlyQuarterlyCash = false,
  showPmsQawView = false,
  dateFormatter = defaultDateFmt,
  formatter = defaultMoneyFmt,
}) => {
  const safeMetrics: PortfolioMetrics = metrics ?? {
    amountInvested: 0,
    currentPortfolioValue: 0,
    returns: 0,
  };

  const showQuarterly = hasQuarterlyData(quarterlyPnl);
  const showMonthly = hasMonthlyData(monthlyPnl, returnViewType);
  const showTxTable = hasTransactions(transactions);

  // helper to read a numeric cell or null (for "–")
  const readNum = (v: unknown): number | null => (isNum(v) ? Number(v) : null);

  return (
    <div className="portfolio-report">
      <style>{styles}</style>
      
      {/* Title pill (thin) - Fixed centering */}
      <div className="title-pill">
        <div className="title-pill-content">
          {(strategyName || "Portfolio Report") + (isActive ? "" : " (Inactive)")}
        </div>
      </div>

      {/* Top stats */}
      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-label">Amount Invested</div>
          <div className="stat-value">{formatter(safeMetrics.amountInvested)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Current Portfolio Value</div>
          <div className="stat-value">{formatter(safeMetrics.currentPortfolioValue)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Returns</div>
          <div className="stat-value">{formatter(safeMetrics.returns)}</div>
        </div>
      </div>

      {/* Trailing Returns */}
      {!isTotalPortfolio && (
        <div style={{ marginBottom: "2rem" }}>
          <div className="section-title">Trailing Returns</div>
          <table className="table-container">
            <thead className="table-header">
              <tr>
                <th className="table-header-cell" style={{ minWidth: "120px" }}>NAME</th>
                {horizonOrder.map((hKey) => (
                  <th key={hKey} className="table-header-cell" style={{ minWidth: "80px" }}>
                    {labelMap[hKey] || hKey}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="table-row">
                <td className="table-cell">SCHEME (%)</td>
                {horizonOrder.map((hKey) => {
                  const cell = combinedTrailing[hKey] as CombinedTrailingCell | undefined;
                  const val = readNum(cell?.portfolio);
                  return (
                    <td key={hKey} className="table-cell">
                      {val == null ? "–" : `${val.toFixed(2)}%`}
                    </td>
                  );
                })}
              </tr>
              <tr className="table-row">
                <td className="table-cell">BENCHMARK (%)</td>
                {horizonOrder.map((hKey) => {
                  const cell = combinedTrailing[hKey] as CombinedTrailingCell | undefined;
                  const val = readNum(cell?.benchmark);
                  return (
                    <td key={hKey} className="table-cell">
                      {val == null ? "–" : `${val.toFixed(2)}%`}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Drawdown */}
      {!isTotalPortfolio && (
        <div style={{ marginBottom: "2rem" }}>
          <div className="section-title">Drawdown</div>
          <table className="table-container">
            <thead className="table-header">
              <tr>
                <th className="table-header-cell" style={{ minWidth: "120px" }}>NAME</th>
                <th className="table-header-cell" style={{ minWidth: "120px" }}>Current Drawdown</th>
                <th className="table-header-cell" style={{ minWidth: "120px" }}>Max Drawdown</th>
              </tr>
            </thead>
            <tbody>
              <tr className="table-row">
                <td className="table-cell">SCHEME (%)</td>
                <td className="table-cell">
                  {isNum(combinedTrailing.currentDD?.portfolio)
                    ? `${Number(combinedTrailing.currentDD?.portfolio).toFixed(2)} %`
                    : "–"}
                </td>
                <td className="table-cell">
                  {isNum(combinedTrailing.MDD?.portfolio)
                    ? `${Number(combinedTrailing.MDD?.portfolio).toFixed(2)} %`
                    : "–"}
                </td>
              </tr>
              <tr className="table-row">
                <td className="table-cell">BENCHMARK (%)</td>
                <td className="table-cell">
                  {isNum(combinedTrailing.currentDD?.benchmark)
                    ? `${Number(combinedTrailing.currentDD?.benchmark).toFixed(2)} %`
                    : "–"}
                </td>
                <td className="table-cell">
                  {isNum(combinedTrailing.MDD?.benchmark)
                    ? `${Number(combinedTrailing.MDD?.benchmark).toFixed(2)} %`
                    : "–"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Note */}
      {!isTotalPortfolio && (
        <div className="note-box">
          Note: Periods under 1 year are absolute; over 1 year are annualised (CAGR).
        </div>
      )}

      {/* Chart */}
      {!isTotalPortfolio && (
        <div style={{ marginBottom: "2rem" }}>
          <div className="section-title">Equity Curve</div>
          <RevenueChart
            equityCurve={equityCurve}
            drawdownCurve={drawdownCurve}
            chart_animation={false}
            lastDate={lastDate}
          />
        </div>
      )}

      {/* Quarterly P&L — prints "–" for missing values */}
      {showQuarterly && (
        <div style={{ marginBottom: "2rem" }}>
          <div className="section-title">Quarterly Profit and Loss (₹)</div>
          <div style={{ borderBottom: "1px solid rgba(0, 0, 0, 0.2)" }}>
            <table className="table-container">
              <tbody>
                <tr className="table-header">
                  <td className="table-cell" style={{ verticalAlign: "middle", minWidth: "80px" }}>YEAR</td>
                  <td className="table-cell" style={{ verticalAlign: "middle", minWidth: "80px" }}>Q1</td>
                  <td className="table-cell" style={{ verticalAlign: "middle", minWidth: "80px" }}>Q2</td>
                  <td className="table-cell" style={{ verticalAlign: "middle", minWidth: "80px" }}>Q3</td>
                  <td className="table-cell" style={{ verticalAlign: "middle", minWidth: "80px" }}>Q4</td>
                  <td className="table-cell" style={{ verticalAlign: "middle", minWidth: "80px" }}>Total</td>
                </tr>

                {Object.keys(quarterlyPnl ?? {})
                  .sort()
                  .map((year) => {
                    const cash = quarterlyPnl?.[year]?.cash;
                    if (!cash) return null;

                    const q1 = readNum(cash.q1);
                    const q2 = readNum(cash.q2);
                    const q3 = readNum(cash.q3);
                    const q4 = readNum(cash.q4);
                    const total = readNum(cash.total);

                    const anyQ = [q1, q2, q3, q4, total].some((v) => v !== null);
                    if (!anyQ) return null;

                    const computedTotal =
                      total ??
                      ([q1, q2, q3, q4].every((v) => v !== null)
                        ? ((q1 as number) + (q2 as number) + (q3 as number) + (q4 as number))
                        : null);

                    return (
                      <tr key={year} className="table-row">
                        <td className="table-cell">{year}</td>
                        <td className={`table-cell ${q1 && q1 > 0 ? "positive-value" : q1 && q1 < 0 ? "negative-value" : ""}`}>
                          {q1 == null ? "–" : formatter(q1)}
                        </td>
                        <td className={`table-cell ${q2 && q2 > 0 ? "positive-value" : q2 && q2 < 0 ? "negative-value" : ""}`}>
                          {q2 == null ? "–" : formatter(q2)}
                        </td>
                        <td className={`table-cell ${q3 && q3 > 0 ? "positive-value" : q3 && q3 < 0 ? "negative-value" : ""}`}>
                          {q3 == null ? "–" : formatter(q3)}
                        </td>
                        <td className={`table-cell ${q4 && q4 > 0 ? "positive-value" : q4 && q4 < 0 ? "negative-value" : ""}`}>
                          {q4 == null ? "–" : formatter(q4)}
                        </td>
                        <td className="table-cell" style={{ fontWeight: 600 }}>
                          {computedTotal == null ? "–" : formatter(computedTotal)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monthly P&L */}
      {!isTotalPortfolio && monthlyPnl && Object.keys(monthlyPnl).length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <div className="section-title">
            Monthly Profit and Loss {returnViewType === "percent" ? "(%)" : "(₹)"}
          </div>

          <div style={{ borderBottom: "1px solid rgba(0, 0, 0, 0.2)", overflowX: "auto" }}>
            <table className="table-container" style={{ minWidth: "900px" }}>
              <thead className="table-header">
                <tr>
                  <th className="table-header-cell" style={{ minWidth: "80px" }}>Year</th>
                  {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"].map((m) => (
                    <th key={m} className="table-header-cell" style={{ padding: "8px 6px", minWidth: "60px" }}>{m}</th>
                  ))}
                  <th className="table-header-cell" style={{ minWidth: "80px" }}>Total</th>
                </tr>
              </thead>

              <tbody>
                {Object.keys(monthlyPnl)
                  .sort()
                  .map((year) => {
                    const y = monthlyPnl[year];
                    const m = y?.months ?? {};

                    const monthsFull = [
                      "January", "February", "March", "April", "May", "June",
                      "July", "August", "September", "October", "November", "December"
                    ];

                    const rowHasAny =
                      monthsFull.some((name) => {
                        const rec = (m as any)[name];
                        return returnViewType === "percent" ? isNum(rec?.percent) : isNum(rec?.cash);
                      }) ||
                      (returnViewType === "percent" ? isNum(y?.totalPercent) : isNum(y?.totalCash));

                    if (!rowHasAny) return null;

                    const asNum = (v: unknown) => (isNum(v) ? Number(v) : NaN);
                    const cellText = (val: number) => returnViewType === "percent" ? `${val.toFixed(2)}%` : formatter(val);

                    return (
                      <tr key={year} className="table-row">
                        <td className="table-cell">{year}</td>

                        {monthsFull.map((fullName) => {
                          const rec = (m as any)[fullName];
                          const raw = returnViewType === "percent" ? asNum(rec?.percent) : asNum(rec?.cash);
                          return (
                            <td
                              key={`${year}-${fullName}`}
                              className={`table-cell ${!isNaN(raw) ? (raw > 0 ? "positive-value" : raw < 0 ? "negative-value" : "") : ""}`}
                              style={{
                                padding: "8px 6px",
                                fontWeight: !isNaN(raw) ? 500 : "normal"
                              }}
                            >
                              {isNaN(raw) ? "–" : cellText(raw)}
                            </td>
                          );
                        })}

                        <td className="table-cell" style={{ fontWeight: 600 }}>
                          {returnViewType === "percent"
                            ? (isNum(y?.totalPercent) ? `${Number(y?.totalPercent).toFixed(2)}%` : "–")
                            : (isNum(y?.totalCash) ? formatter(Number(y?.totalCash)) : "–")}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cash In/Out */}
      {showTxTable && (
        <div style={{ marginBottom: "2rem" }}>
          <div className="section-title">Cash In/Cash Out</div>
          <div style={{ borderBottom: "1px solid rgba(0, 0, 0, 0.2)" }}>
            <table className="table-container">
              <thead className="table-header">
                <tr>
                  <th className="table-header-cell" style={{ padding: "12px", fontSize: "1rem" }}>Date</th>
                  <th className="table-header-cell" style={{ padding: "12px", fontSize: "1rem" }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction, index) => (
                  <tr key={`${transaction.date}-${index}`} className="table-row">
                    <td className="table-cell" style={{ padding: "12px", fontSize: "1rem", whiteSpace: "nowrap" }}>
                      {dateFormatter(transaction.date)}
                    </td>
                    <td
                      className={`table-cell ${Number(transaction.amount) > 0 ? "positive-value" : "negative-value"}`}
                      style={{
                        padding: "12px",
                        fontSize: "1rem",
                        fontWeight: 500,
                        whiteSpace: "nowrap"
                      }}
                    >
                      {formatter(Number(transaction.amount))}
                    </td>
                  </tr>
                ))}
                <tr className="table-row" style={{ borderBottom: "1px solid rgba(0, 0, 0, 0.2)", fontWeight: 600 }}>
                  <td className="table-cell" style={{ padding: "12px", fontSize: "1rem" }}>Total In</td>
                  <td
                    className={`table-cell ${Number(cashFlowTotals?.totalIn) > 0 ? "positive-value" : "negative-value"}`}
                    style={{
                      padding: "12px",
                      fontSize: "1rem",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {formatter(cashFlowTotals?.totalIn ?? 0)}
                  </td>
                </tr>
                <tr className="table-row" style={{ borderBottom: "1px solid rgba(0, 0, 0, 0.2)", fontWeight: 600 }}>
                  <td className="table-cell" style={{ padding: "12px", fontSize: "1rem" }}>Total Out</td>
                  <td
                    className={`table-cell ${Number(cashFlowTotals?.totalOut) > 0 ? "positive-value" : "negative-value"}`}
                    style={{
                      padding: "12px",
                      fontSize: "1rem",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {formatter(cashFlowTotals?.totalOut ?? 0)}
                  </td>
                </tr>
                <tr className="table-row" style={{ borderBottom: "1px solid rgba(0, 0, 0, 0.2)", fontWeight: 600 }}>
                  <td className="table-cell" style={{ padding: "12px", fontSize: "1rem" }}>Net Flow</td>
                  <td
                    className={`table-cell ${(cashFlowTotals?.netFlow ?? 0) >= 0 ? "positive-value" : "negative-value"}`}
                    style={{
                      padding: "12px",
                      fontSize: "1rem",
                      fontWeight: 700,
                      whiteSpace: "nowrap"
                    }}
                  >
                    {formatter(cashFlowTotals?.netFlow ?? 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="final-note">
        <strong style={{ fontSize: "0.875rem", fontWeight: 600 }}>Note:</strong>
        <ul style={{ listStyleType: "disc", paddingLeft: "1.5rem", marginTop: "0.5rem" }}>
          <li style={{ fontSize: "0.875rem", marginBottom: "0.25rem" }}>Positive numbers represent cash inflows</li>
          <li style={{ fontSize: "0.875rem" }}>Negative numbers represent cash outflows</li>
        </ul>
      </div>
    </div>
  );
};

export default PortfolioReport;