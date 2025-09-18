export type ReturnView = "percent" | "cash";

interface Transaction { date: string; amount: number; }
interface CashFlowTotals { totalIn: number; totalOut: number; netFlow: number; }
interface PortfolioMetrics { amountInvested: number; currentPortfolioValue: number; returns: number;returns_percent:number; }

type CombinedTrailingCell = { portfolio?: string | number | null; benchmark?: string | number | null; };
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
    percent: { q1: string | number; q2: string | number; q3: string | number; q4: string | number; total: string | number; };
    cash: { q1: string | number; q2: string | number; q3: string | number; q4: string | number; total: string | number; };
    yearCash: string | number;
  };
}

interface MonthlyPnl {
  [year: string]: {
    months: { [month: string]: { percent?: string | number; cash?: string | number; capitalInOut?: string | number; } };
    totalPercent?: number | string;
    totalCash?: number | string;
    totalCapitalInOut?: number | string;
  };
}

export interface PortfolioReportProps {
  transactions: Transaction[];
  cashFlowTotals: CashFlowTotals;
  metrics: PortfolioMetrics;
  equityCurve?: { date: string; value?: number; nav?: number }[];
  drawdownCurve?: { date: string; value?: number; drawdown?: number }[];
  /** NEW: optional benchmark series for the chart */
  benchmarkEquityCurve?: { date: string; value?: number; nav?: number }[];
  benchmarkDrawdownCurve?: { date: string; value?: number; drawdown?: number }[];
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

type Metadata = { inceptionDate?: string | null; dataAsOfDate?: string | null };

const defaultDateFmt = (d: string) => {
  const dt = new Date(d);
  return isNaN(+dt) ? d : dt.toLocaleDateString("en-IN");
};
const defaultMoneyFmt = (v: number) =>
  v === 0
    ? "-"
    : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(v);

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const pctStr = (v: unknown): string => {
  const n = num(v);
  return n === null ? "-" : `${n.toFixed(2)}%`;
};

const getPnlColorClass = (v: unknown) => {
  const n = num(v);
  if (n === null) return "neutral";
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "neutral";
};

const formatPnlValue = (v: unknown) => {
  const n = num(v);
  return n === null ? "-" : `${n.toFixed(2)}%`;
};

const formatCashAmountWith = (fmt: (x: number) => string) => (v: unknown) => {
  const n = num(v);
  return n === null ? "-" : fmt(n);
};

const monthOrderFull = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

export function buildPortfolioReportHTML(
  props: PortfolioReportProps & {
    sessionUserName?: string | null;
    currentMetadata?: Metadata;
  }
) {
  const {
    transactions = [],
    cashFlowTotals,
    metrics,
    equityCurve = [],
    drawdownCurve = [],
    benchmarkEquityCurve = [],
    benchmarkDrawdownCurve = [],
    combinedTrailing,
    monthlyPnl = null,
    quarterlyPnl = null,
    lastDate,
    strategyName,
    isActive = true,
    isTotalPortfolio = false,
    dateFormatter = defaultDateFmt,
    formatter = defaultMoneyFmt,
    sessionUserName = "User",
    currentMetadata
  } = props;

  // Header display
  const title = strategyName || "Total Portfolio";
  const statusLabel = isActive ? "ACTIVE PORTFOLIO" : "INACTIVE";

  // Top stats
  const statItems = [
    { name: "Amount Invested", value: formatter(metrics?.amountInvested || 0) },
    { name: "Current Portfolio Value", value: formatter(metrics?.currentPortfolioValue || 0) },
    { name: "Returns (%)", value: `${metrics?.returns_percent} %` },
    { name: "Returns (₹)", value: formatter(metrics?.returns || 0) },
  ];

  // Trailing returns (scheme row)
  const trailingReturnsData = {
    fiveDays: combinedTrailing?.fiveDays?.portfolio,
    tenDays: combinedTrailing?.tenDays?.portfolio,
    fifteenDays: combinedTrailing?.fifteenDays?.portfolio,
    oneMonth: combinedTrailing?.oneMonth?.portfolio,
    threeMonths: combinedTrailing?.threeMonths?.portfolio,
    oneYear: combinedTrailing?.oneYear?.portfolio,
    twoYears: combinedTrailing?.twoYears?.portfolio,
    sinceInception: combinedTrailing?.sinceInception?.portfolio,
    currentDD: combinedTrailing?.currentDD?.portfolio,
    MDD: combinedTrailing?.MDD?.portfolio,
  };

  // Benchmark row (if available)
  const trailingReturnsBenchmark = {
    fiveDays: combinedTrailing?.fiveDays?.benchmark,
    tenDays: combinedTrailing?.tenDays?.benchmark,
    fifteenDays: combinedTrailing?.fifteenDays?.benchmark,
    oneMonth: combinedTrailing?.oneMonth?.benchmark,
    threeMonths: combinedTrailing?.threeMonths?.benchmark,
    oneYear: combinedTrailing?.oneYear?.benchmark,
    twoYears: combinedTrailing?.twoYears?.benchmark,
    sinceInception: combinedTrailing?.sinceInception?.benchmark,
    currentDD: combinedTrailing?.currentDD?.benchmark,
    MDD: combinedTrailing?.MDD?.benchmark,
  };

  // Drawdown metrics
  const drawdownMetrics = {
    maxDrawdown: trailingReturnsData.MDD ?? null,
    currentDrawdown: trailingReturnsData.currentDD ?? null,
  };

  // Quarterly (%)
  const quarterlyDataPercent = Object.keys(quarterlyPnl || {})
    .sort()
    .map((year) => {
      const row = (quarterlyPnl as QuarterlyPnl)[year]?.percent;
      return {
        year,
        q1: row?.q1 ?? null,
        q2: row?.q2 ?? null,
        q3: row?.q3 ?? null,
        q4: row?.q4 ?? null,
        total: row?.total ?? null,
      };
    });

  // Quarterly (₹) for Total Portfolio mode
  const quarterlyDataCash = Object.keys(quarterlyPnl || {})
    .sort()
    .map((year) => {
      const row = (quarterlyPnl as QuarterlyPnl)[year]?.cash;
      return {
        year,
        q1: row?.q1 ?? null,
        q2: row?.q2 ?? null,
        q3: row?.q3 ?? null,
        q4: row?.q4 ?? null,
        total: row?.total ?? null,
      };
    });

  // Monthly (%)
  const monthlyData = Object.keys(monthlyPnl || {})
    .sort()
    .map((year) => {
      const rec = (monthlyPnl as MonthlyPnl)[year];
      const months = rec?.months || {};
      const row: any = { year, months: {}, totalPercent: rec?.totalPercent };
      monthOrderFull.forEach((m) => {
        row.months[m] = { percent: months[m]?.percent ?? null };
      });
      return row;
    });

  // Recent cash flows
  const formatCashAmount = formatCashAmountWith(formatter);
  const recentCashFlows = transactions.map((t) => ({
    date: dateFormatter(t.date),
    amount: Number(t.amount),
  }));

  // Month header (short)
  const monthOrderShort = monthOrderFull.map((m) => m.slice(0, 3));

  // Inception/data dates
  const inceptionDisp = currentMetadata?.inceptionDate ? dateFormatter(currentMetadata.inceptionDate) : "N/A";
  const dataAsOfDisp = currentMetadata?.dataAsOfDate
    ? dateFormatter(currentMetadata.dataAsOfDate)
    : (lastDate ? dateFormatter(lastDate) : "N/A");

  // =============== HTML ===============
  const showFullPages = !isTotalPortfolio; // if total portfolio => only summary + quarterly cash + cash flows

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Portfolio Report - ${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Lato:wght@300;400;500;600&family=Inria+Serif:wght@300;400;700&display=swap" rel="stylesheet">
  <script src="https://code.highcharts.com/highcharts.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Lato', sans-serif; background-color: #EFECD3; color: #333; line-height: 1.5; font-size: 12px; }
    .page { width: 210mm; height: 297mm; padding: 5mm; margin: 0; background-color: #EFECD3; page-break-after: always; display: flex; flex-direction: column; position: relative; }
    .page:last-child { page-break-after: auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 3px solid #02422B; }
    .header-left h1 { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #02422B; margin-bottom: 5px; }
    .header-left p { font-size: 14px; color: #666; font-weight: 400; }
    .header-right { text-align: right; }
    .header-right .date { font-size: 11px; color: #666; margin-bottom: 5px; }
    .header-right .status { background-color: #02422B; color: #DABD38; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; }
    .stat-card { background: #EFECD3; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #DABD38; }
    .stat-card h3 { font-size: 11px; color: #666; margin-bottom: 8px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-card .value { font-family: 'Inria Serif'; font-size: 18px; font-weight: 500; color: #02422B; }
    .section { background: #EFECD3; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    /* NOTE: default page-break-inside avoided for short sections, but we provide a utility to allow splitting */
    .section.no-split { page-break-inside: avoid; -webkit-column-break-inside: avoid; break-inside: avoid; }
    .section.allow-break { page-break-inside: auto; -webkit-column-break-inside: auto; break-inside: auto; }
    .section-header { color: #02422B; padding: 12px 0px; font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 600; }
    .section-content { padding: 0px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background-color: #02422B; color: white; padding: 10px 8px; text-align: center; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 8px; text-align: center; border-bottom: 1px solid #eee; }
    tr { }
    thead { display: table-header-group; }
    tbody { display: table-row-group; }
    tr:nth-child(even) { background-color: rgba(255,255,255,0.3); }
    .positive { color: #059669; }
    .negative { color: #dc2626; }
    .neutral { color: #374151; }
    .cash-flow-positive { color: #059669; font-weight: 600; }
    .cash-flow-negative { color: #dc2626; font-weight: 600; }
    .summary-row { background-color: rgba(243,244,246,0.5); font-weight: 600; }
    .trailing-returns-table th:first-child, .trailing-returns-table td:first-child { text-align: left; font-weight: 500; }
    .note { font-size: 10px; color: #666; margin-top: 10px; font-style: italic; padding: 0 8px 8px; }
    .footer { margin-top: auto; padding-top: 15px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #666; }
    .disclaimer { font-size: 9px; color: #999; line-height: 1.4; max-width: 75%; }
    .page-number { font-family: 'Playfair Display', serif; font-size: 12px; color: #02422B; font-weight: 600; }
    .chart-container { width: 100%; height: 400px; margin-bottom: 20px; margin-top: 20px;}
    .right-align {
      text-align: right;
    }
    .left-align {
      text-align: left;
    }
    .cashflow-section {
      /* allow this section to split across pages when needed */
    }
    @page { size: A4 portrait; margin: 0; }
    @media print {
      body, .page, .stat-card, .section, .header, th, .section-header, .header-right .status, .chart-container {
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      /* allow content splitting for long flows */
      .section.allow-break { page-break-inside: auto; -webkit-column-break-inside: auto; break-inside: auto; }
    }
  </style>
</head>
<body>

  <!-- Page 1: Always shows Summary -->
  <div class="page">
    <div class="header">
      <div class="header-left">
        <h1>${sessionUserName}<h1>
        <p>${title}</p>
      </div>
      <div class="header-right">
        <div class="date">Inception Date: ${inceptionDisp}</div>
        <div class="date">Data as of: ${dataAsOfDisp}</div>
        
      </div>
    </div>

    <div class="stats-grid">
      ${statItems.map(s => `
        <div class="stat-card">
          <h4>${s.name}</h4>
          <div class="value">${s.value}</div>
        </div>
      `).join("")}
    </div>

    ${
      showFullPages
        ? `
        <div class="section-header">Trailing Returns</div>
        <div class="section no-split">
          <div class="section-content">
            <table class="trailing-returns-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>5d</th><th>10d</th><th>15d</th><th>1m</th><th>3m</th><th>1y</th><th>2y</th><th>Since Inception</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="text-align:left;font-weight:600;">Scheme (%)</td>
                  <td class="${getPnlColorClass(trailingReturnsData.fiveDays)}">${pctStr(trailingReturnsData.fiveDays)}</td>
                  <td class="${getPnlColorClass(trailingReturnsData.tenDays)}">${pctStr(trailingReturnsData.tenDays)}</td>
                  <td class="${getPnlColorClass(trailingReturnsData.fifteenDays)}">${pctStr(trailingReturnsData.fifteenDays)}</td>
                  <td class="${getPnlColorClass(trailingReturnsData.oneMonth)}">${pctStr(trailingReturnsData.oneMonth)}</td>
                  <td class="${getPnlColorClass(trailingReturnsData.threeMonths)}">${pctStr(trailingReturnsData.threeMonths)}</td>
                  <td class="${getPnlColorClass(trailingReturnsData.oneYear)}">${pctStr(trailingReturnsData.oneYear)}</td>
                  <td class="${getPnlColorClass(trailingReturnsData.twoYears)}">${pctStr(trailingReturnsData.twoYears)}</td>
                  <td class="${getPnlColorClass(trailingReturnsData.sinceInception)}">${pctStr(trailingReturnsData.sinceInception)}</td>
      
                </tr>
                <tr>
                  <td style="text-align:left;font-weight:600;">Benchmark (%)</td>
                  <td class="${getPnlColorClass(trailingReturnsBenchmark.fiveDays)}">${pctStr(trailingReturnsBenchmark.fiveDays)}</td>
                  <td class="${getPnlColorClass(trailingReturnsBenchmark.tenDays)}">${pctStr(trailingReturnsBenchmark.tenDays)}</td>
                  <td class="${getPnlColorClass(trailingReturnsBenchmark.fifteenDays)}">${pctStr(trailingReturnsBenchmark.fifteenDays)}</td>
                  <td class="${getPnlColorClass(trailingReturnsBenchmark.oneMonth)}">${pctStr(trailingReturnsBenchmark.oneMonth)}</td>
                  <td class="${getPnlColorClass(trailingReturnsBenchmark.threeMonths)}">${pctStr(trailingReturnsBenchmark.threeMonths)}</td>
                  <td class="${getPnlColorClass(trailingReturnsBenchmark.oneYear)}">${pctStr(trailingReturnsBenchmark.oneYear)}</td>
                  <td class="${getPnlColorClass(trailingReturnsBenchmark.twoYears)}">${pctStr(trailingReturnsBenchmark.twoYears)}</td>
                  <td class="${getPnlColorClass(trailingReturnsBenchmark.sinceInception)}">${pctStr(trailingReturnsBenchmark.sinceInception)}</td>
                  
                </tr>
              </tbody>
            </table>
            <div class="note"><strong>Returns:</strong> Periods under 1 year are absolute; 1+ year are annualized (CAGR).</div>
          </div>
        </div>

        
        <div class="section-header">Drawdown Metrics</div>

        <div class="section no-split">
          <div class="section-content">
            <table>
              <thead><tr><th class="left-align">Metric</th><th class="right-align">Current Drawdown</th><th class="right-align">Maximum Drawdown</th></tr></thead>
              <tbody>
                <tr><td style="font-weight:600;" class="left-align">SCHEME (%)</td><td class="negative right-align">${pctStr(trailingReturnsData.currentDD)}</td><td class="negative right-align">${pctStr(trailingReturnsData.MDD)}</td></tr>
                <tr><td style="font-weight:600;" class="left-align">BENCHMARK (%)</td><td class="negative right-align">${pctStr(trailingReturnsBenchmark.currentDD)}</td><td class="negative right-align">${pctStr(trailingReturnsBenchmark.MDD)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>


        <div class="section-header">Portfolio & Benchmark — Performance and Drawdown</div>
        <div class="section no-split">
          <div class="section-content">
            <div id="chart-container" class="chart-container"></div>
          </div>
        </div>
        `
        : `
        <div class="section-header">Quarterly Profit and Loss (₹)</div>
        <div class="section no-split">
          <div class="section-content">
            <table class="quarterly-table">
              <thead>
                <tr><th>Year</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Total</th></tr>
              </thead>
              <tbody>
                ${
                  quarterlyDataCash.length
                    ? quarterlyDataCash.map(row => `
                      <tr>
                        <td style="font-weight:600;">${row.year}</td>
                        <td class="${getPnlColorClass(row.q1)}">${formatCashAmount(row.q1)}</td>
                        <td class="${getPnlColorClass(row.q2)}">${formatCashAmount(row.q2)}</td>
                        <td class="${getPnlColorClass(row.q3)}">${formatCashAmount(row.q3)}</td>
                        <td class="${getPnlColorClass(row.q4)}">${formatCashAmount(row.q4)}</td>
                        <td class="${getPnlColorClass(row.total)}" style="font-weight:600;">${formatCashAmount(row.total)}</td>
                      </tr>`).join("")
                    : `<tr><td colspan="6" style="text-align:center;">No data available</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
        `
    }

    <div class="footer">
        <div class="disclaimer"></div>
        <div class="page-number">1 | Qode</div>
    </div>
  </div>

  ${
    showFullPages
      ? `
        <!-- Page 2: P&L (%) -->
        <div class="page">
          <div class="header">
            <div class="header-left">
        <h1>${sessionUserName}<h1>
              <p>${title}</p>
            </div>
            <div class="header-right">
              <div class="date">Inception Date: ${inceptionDisp}</div>
              <div class="date">Data as of: ${dataAsOfDisp}</div>
              
            </div>
          </div>
          <div class="section-header">Quarterly Profit and Loss (%)</div>

          <div class="section no-split">
            <div class="section-content">
              <table class="quarterly-table">
                <thead>
                  <tr><th>Year</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Total</th></tr>
                </thead>
                <tbody>
                  ${
                    quarterlyDataPercent.length
                      ? quarterlyDataPercent.map(row => `
                        <tr>
                          <td style="font-weight:600;">${row.year}</td>
                          <td class="${getPnlColorClass(row.q1)}">${formatPnlValue(row.q1)}</td>
                          <td class="${getPnlColorClass(row.q2)}">${formatPnlValue(row.q2)}</td>
                          <td class="${getPnlColorClass(row.q3)}">${formatPnlValue(row.q3)}</td>
                          <td class="${getPnlColorClass(row.q4)}">${formatPnlValue(row.q4)}</td>
                          <td class="${getPnlColorClass(row.total)}" style="font-weight:600;">${formatPnlValue(row.total)}</td>
                        </tr>`).join("")
                      : `<tr><td colspan="6" style="text-align:center;">No data available</td></tr>`
                  }
                </tbody>
              </table>
            </div>
          </div>
          <div class="section-header">Monthly Profit and Loss (%)</div>

          <div class="section no-split">
            <div class="section-content">
              <table class="monthly-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    ${monthOrderShort.map(m => `<th>${m}</th>`).join("")}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    monthlyData.length
                      ? monthlyData.map(row => `
                        <tr>
                          <td style="font-weight:600;">${row.year}</td>
                          ${monthOrderFull.map(m => {
                            const val = row.months[m]?.percent ?? null;
                            return `<td class="${getPnlColorClass(val)}">${formatPnlValue(val)}</td>`;
                          }).join("")}
                          <td class="${getPnlColorClass(row.totalPercent)}" style="font-weight:600;">${formatPnlValue(row.totalPercent)}</td>
                        </tr>`).join("")
                      : `<tr><td colspan="14" style="text-align:center;">No data available</td></tr>`
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div class="footer">
            <div class="disclaimer"></div>
            <div class="page-number">2 | Qode</div>
          </div>
        </div>

        <!-- Page 3: Cash Flows -->
        <div class="page">
          <div class="header">
            <div class="header-left">
        <h1>${sessionUserName}<h1>
              <p>${title}</p>
            </div>
            <div class="header-right">
              <div class="date">Inception Date: ${inceptionDisp}</div>
              <div class="date">Data as of: ${dataAsOfDisp}</div>
              
            </div>
          </div>

            <div class="section-header">Cash In / Cash Out</div>
          <!-- IMPORTANT: .section.allow-break allows this section to be split across pages dynamically -->
          <div class="section allow-break cashflow-section">
            <div class="section-content">
              ${
                recentCashFlows.length
                  ? `
                    <table class="cash-flows-table" id="cash-flows-table">
                      <thead><tr><th class="left-align">Date</th><th class="right-align">Amount</th></tr></thead>
                      <tbody>
                        ${recentCashFlows.map(flow => `
                          <tr>
                            <td class="left-align">${flow.date}</td>
                            <td class="${flow.amount > 0 ? 'cash-flow-positive' : 'cash-flow-negative'} right-align">
                              ${flow.amount > 0 ? '+' : ''}${formatCashAmount(flow.amount)}
                            </td>
                          </tr>`).join("")}
                        <tr class="summary-row">
                          <td style="font-weight:600;" class="left-align">Total Cash In</td>
                          <td class="cash-flow-positive right-align">+${formatCashAmount(cashFlowTotals.totalIn)}</td>
                        </tr>
                        <tr class="summary-row">
                          <td style="font-weight:600;" class="left-align">Total Cash Out</td>
                          <td class="cash-flow-negative right-align">${formatCashAmount(cashFlowTotals.totalOut)}</td>
                        </tr>
                        <tr class="summary-row">
                          <td style="font-weight:600;" class="left-align">Net Cash Flow</td>
                          <td class="${cashFlowTotals.netFlow >= 0 ? 'cash-flow-positive' : 'cash-flow-negative'} right-align">
                            ${cashFlowTotals.netFlow >= 0 ? '+' : ''}${formatCashAmount(cashFlowTotals.netFlow)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div class="note" style="margin-top:15px;">
                      <strong>Notes:</strong><br>
                      • Positive amounts represent cash inflows<br>
                      • Negative amounts represent cash outflows<br>
                      • Showing ${recentCashFlows.length} transactions
                    </div>
                  `
                  : `<div style="text-align:center;padding:20px;color:#666;">No cash flow data available</div>`
              }
            </div>
          </div>

          <div class="footer">
            <div class="disclaimer"></div>
            <div class="page-number">3 | Qode</div>
          </div>
        </div>
      `
      : `
        <!-- Total Portfolio: Page 2 — Cash Flows -->
        <div class="page">
          <div class="header">
            <div class="header-left">
        <h1>${sessionUserName}<h1>
              <p>${title}</p>
            </div>
            <div class="header-right">
              <div class="date">Inception Date: ${inceptionDisp}</div>
              <div class="date">Data as of: ${dataAsOfDisp}</div>
              
            </div>
          </div>

            <div class="section-header">Cash In / Cash Out</div>
          <div class="section allow-break cashflow-section">
            <div class="section-content">
              ${
                recentCashFlows.length
                  ? `
                    <table class="cash-flows-table" id="cash-flows-table">
                      <thead><tr><th class="left-align">Date</th><th class="right-align">Amount</th></tr></thead>
                      <tbody>
                        ${recentCashFlows.map(flow => `
                          <tr>
                            <td class="left-align">${flow.date}</td>
                            <td class="right-align ${flow.amount > 0 ? 'cash-flow-positive' : 'cash-flow-negative'}">
                              ${flow.amount > 0 ? '+' : ''}${formatCashAmount(flow.amount)}
                            </td>
                          </tr>`).join("")}
                        <tr class="summary-row">
                          <td style="font-weight:600;" class="left-align">Total Cash In</td>
                          <td class="cash-flow-positive right-align">+${formatCashAmount(cashFlowTotals.totalIn)}</td>
                        </tr>
                        <tr class="summary-row">
                          <td style="font-weight:600;" class="left-align">Total Cash Out</td>
                          <td class="cash-flow-negative right-align">${formatCashAmount(cashFlowTotals.totalOut)}</td>
                        </tr>
                        <tr class="summary-row">
                          <td style="font-weight:600;" class="left-align">Net Cash Flow</td>
                          <td class="${cashFlowTotals.netFlow >= 0 ? 'cash-flow-positive' : 'cash-flow-negative'} right-align">
                            ${cashFlowTotals.netFlow >= 0 ? '+' : ''}${formatCashAmount(cashFlowTotals.netFlow)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div class="note" style="margin-top:15px;">
                      <strong>Notes:</strong><br>
                      • Positive amounts represent cash inflows<br>
                      • Negative amounts represent cash outflows<br>
                      • Showing ${recentCashFlows.length} transactions
                    </div>
                  `
                  : `<div style="text-align:center;padding:20px;color:#666;">No cash flow data available</div>`
              }
            </div>
          </div>

          <div class="footer">
            <div class="disclaimer"></div>
            <div class="page-number">2 | Qode</div>
          </div>
        </div>
      `
  }

  <script>
    (function(){
      const equityCurve = ${JSON.stringify(equityCurve || [])};
      const drawdownCurve = ${JSON.stringify(drawdownCurve || [])};
      const benchCurve = ${JSON.stringify(benchmarkEquityCurve || [])};
      const benchDDCurve = ${JSON.stringify(benchmarkDrawdownCurve || [])};
      const showFullPages = ${JSON.stringify(showFullPages)};
      const isTotalPortfolio = ${JSON.stringify(isTotalPortfolio)};

      if (showFullPages) {
        // Portfolio series
        const portfolioDataRaw = (equityCurve || []).map(p => {
          const val = parseFloat(p.value ?? p.nav);
          if (!isFinite(val)) return null;
          return [ new Date(p.date).getTime(), val ];
        }).filter(Boolean);

        const firstVal = (portfolioDataRaw[0] && portfolioDataRaw[0][1]) || 100;
        const portfolioData = portfolioDataRaw.map(d => [ d[0], (d[1] / firstVal) * 100 ]);

        // Benchmark series (optional)
        const benchDataRaw = (benchCurve || []).map(p => {
          const val = parseFloat(p.value ?? p.nav);
          if (!isFinite(val)) return null;
          return [ new Date(p.date).getTime(), val ];
        }).filter(Boolean);
        const benchFirstVal = (benchDataRaw[0] && benchDataRaw[0][1]) || (portfolioDataRaw[0]?.[1] ?? 100);
        const benchData = benchDataRaw.length
          ? benchDataRaw.map(d => [ d[0], (d[1] / benchFirstVal) * 100 ])
          : [];

        // Drawdown series
        const ddData = (drawdownCurve || []).map(p => {
          const v = parseFloat(p.value ?? p.drawdown);
          if (!isFinite(v)) return null;
          return [ new Date(p.date).getTime(), v === 0 ? 0 : -Math.abs(v) ];
        }).filter(Boolean);

        const benchDDData = (benchDDCurve || []).map(p => {
          const v = parseFloat(p.value ?? p.drawdown);
          if (!isFinite(v)) return null;
          return [ new Date(p.date).getTime(), v === 0 ? 0 : -Math.abs(v) ];
        }).filter(Boolean);

        // Align dd series start
        if (ddData.length && portfolioData.length && ddData[0][0] > portfolioData[0][0]) {
          ddData.unshift([ portfolioData[0][0], 0 ]);
        }
        if (benchDDData.length && benchData.length && benchDDData[0][0] > benchData[0][0]) {
          benchDDData.unshift([ benchData[0][0], 0 ]);
        }

        function calcNavScale(values) {
          if (!values.length) return {min: 0, max: 100, tickAmount: 6};
          const mn = Math.min.apply(null, values);
          const mx = Math.max.apply(null, values);
          const range = mx - mn;
          const buffer = range * (range < 5 ? 0.5 : range < 20 ? 0.3 : range < 50 ? 0.2 : 0.1);
          const min = Math.max(0, mn - buffer), max = mx + buffer;
          const tickAmount = Math.max(5, Math.min(12, Math.ceil((max - min) / 10)));
          return { min, max, tickAmount };
        }

        function calcDDScale(values) {
          const nums = values.filter(v => typeof v === 'number' && isFinite(v));
          if (!nums.length) return { min: -10, max: 0, tickAmount: 3 };
          const mn = Math.min.apply(null, nums.concat([0]));
          const mx = Math.max.apply(null, nums.concat([0]));
          const range = Math.abs(mx - mn);
          const buf = Math.max(range * 0.1, 1);
          const min = Math.min(mn - buf, -2);
          const max = Math.max(mx + buf/2, 1);
          const tickAmount = Math.max(3, Math.min(4, Math.ceil(Math.abs(max - min) / 2)));
          return { min, max: 0, tickAmount };
        }

        const navVals = portfolioData.map(d => d[1]).concat(benchData.map(d => d[1]));
        const ddVals  = ddData.map(d => d[1]).concat(benchDDData.map(d => d[1]));
        const navScale = calcNavScale(navVals);
        const ddScale  = calcDDScale(ddVals);

        const dateRange = (function() {
          const combined = portfolioData.concat(benchData);
          if (combined.length <= 1) return 0;
          const sorted = combined.slice().sort((a,b)=>a[0]-b[0]);
          return sorted[sorted.length - 1][0] - sorted[0][0];
        })();
        const tickInterval = dateRange > 0 ? Math.max(7*24*60*60*1000, Math.ceil(dateRange / 20)) : undefined;

        Highcharts.chart('chart-container', {
          chart: { zoomType: 'xy', height: 400, backgroundColor: 'transparent', plotBackgroundColor: 'transparent', style: { fontFamily: 'Lato, sans-serif' }},
          title: { text: '' },
          xAxis: {
            type: 'datetime',
            title: { text: 'Date', style: { color: '#2E8B57', fontSize: '12px', fontFamily: 'Lato, sans-serif' } },
            labels: { format: '{value:%d-%m-%Y}', style: { color: '#2E8B57', fontSize: '12px', fontFamily: 'Lato, sans-serif' } },
            tickInterval,
            gridLineColor: '#e6e6e6',
            tickWidth: 1,
            lineColor: '#2E8B57'
          },
          yAxis: [{
            title: { text: 'Performance', style: { color: '#2E8B57', fontSize: '12px', fontFamily: 'Lato, sans-serif' } },
            height: '50%', top: '0%',
            labels: { formatter: function(){ return (Math.round(this.value*100)/100) + ''; }, style: { color: '#2E8B57', fontSize: '12px' } },
            min: navScale.min, max: navScale.max, tickAmount: navScale.tickAmount,
            lineColor: '#2E8B57', tickColor: '#2E8B57', tickWidth: 1, gridLineColor: '#e6e6e6',
            plotLines: [{ value: 100, color: '#2E8B57', width: 1, zIndex: 5, dashStyle: 'dot' }]
          },{
            title: { text: 'Drawdown', style: { color: '#FF4560', fontSize: '12px', fontFamily: 'Lato, sans-serif' } },
            height: '30%', top: '65%', offset: 0,
            min: ddScale.min, max: 0, tickAmount: ddScale.tickAmount,
            labels: { formatter: function(){ return (Math.round(this.value*100)/100) + '%'; }, style: { color: '#FF4560', fontSize: '12px' } },
            lineColor: '#FF4560', tickColor: '#FF4560', tickWidth: 1, gridLineColor: '#e6e6e6'
          }],
          tooltip: {
            shared: true, xDateFormat: '%d-%m-%Y', valueDecimals: 2, style: { fontFamily: 'Lato, sans-serif' },
            formatter: function() {
              const get = (name) => this.points?.find(pt => pt.series.name === name);
              const p  = get('Portfolio');
              const pb = get('Benchmark');
              const d  = get('Portfolio Drawdown');
              const db = get('Benchmark Drawdown');
              let s = '<b>' + Highcharts.dateFormat('%d-%m-%Y', this.x) + '</b><br/><br/>';
              s += '<span style="font-weight:bold;">Performance:</span><br/>';
              s += '<span style="color:#2E8B57;">●</span> Portfolio: ' + (p ? p.y.toFixed(2) : 'N/A') + '<br/>';
              if (pb) s += '<span style="color:#1f4f8a;">●</span> Benchmark: ' + pb.y.toFixed(2) + '<br/>';
              s += '<br/><span style="font-weight:bold;">Drawdown:</span><br/>';
              s += '<span style="color:#FF4560;">●</span> Portfolio: ' + (d ? d.y.toFixed(2) + '%' : 'N/A') + '<br/>';
              if (db) s += '<span style="color:#a83279;">●</span> Benchmark: ' + db.y.toFixed(2) + '%' + '<br/>';
              return s;
            }
          },
          legend: { enabled: true, layout: 'horizontal', align: 'center', verticalAlign: 'bottom', itemStyle: { fontSize: '12px', color: '#2E8B57' } },
          plotOptions: { line: { marker: { enabled: false } }, area: { fillOpacity: 0.2, marker: { enabled: false } }, series: { animation: false } },
          series: [
            { name: 'Portfolio', data: portfolioData, color: '#2E8B57', zIndex: 3, yAxis: 0, type: 'line', marker: { enabled: false } },
            ${benchmarkEquityCurve.length ? `{ name: 'BSE500', data: benchData, color: '#1f4f8a', zIndex: 2, yAxis: 0, type: 'line', marker: { enabled: false } },` : ``}
            { name: 'Portfolio Drawdown', data: ddData, color: '#FF4560', zIndex: 1, yAxis: 1, type: 'area', marker: { enabled: false }, fillOpacity: 0.2, threshold: 0, tooltip: { valueSuffix: '%' } }
            ${benchmarkDrawdownCurve.length ? `,{ name: 'BSE500 Drawdown', data: benchDDData, color: '#ff8700', zIndex: 1, yAxis: 1, type: 'area', marker: { enabled: false }, fillOpacity: 0.15, threshold: 0, tooltip: { valueSuffix: '%' } }` : ``}
          ],
          credits: { enabled: false }
        });
      }

      // =====================
      // Fixed pagination for cash flow tables
      // =====================
      function paginateLongTable(tableId) {
        const table = document.getElementById(tableId);
        if (!table) return;

        const page = table.closest('.page');
        if (!page) return;

        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        
        const allRows = Array.from(tbody.querySelectorAll('tr'));
        if (allRows.length <= 25) return; // Don't paginate if 25 or fewer rows

        // Store original rows
        const originalRows = allRows.map(row => row.cloneNode(true));
        
        // Set starting page number based on portfolio type
        let nextPageNum = isTotalPortfolio ? 3 : 4; // Next page after cash flows page
        
        function createContinuationPage(refPage, pageNum) {
          const newPage = refPage.cloneNode(true);
          
          // Update page number in footer
          const footerPageNum = newPage.querySelector('.footer .page-number');
          if (footerPageNum) {
            footerPageNum.textContent = pageNum + ' | Qode';
          }
          
          // Update section header to show continuation
          const sectionHeader = newPage.querySelector('.section-header');
          if (sectionHeader) {
            sectionHeader.textContent = 'Cash In / Cash Out';
          }
          
          // Clear the table body in new page
          const newTbody = newPage.querySelector('tbody');
          if (newTbody) {
            newTbody.innerHTML = '';
          }
          
          // Insert the new page after the reference page
          if (refPage.nextSibling) {
            refPage.parentNode.insertBefore(newPage, refPage.nextSibling);
          } else {
            refPage.parentNode.appendChild(newPage);
          }
          
          return newPage;
        }

        // Clear original tbody and repopulate with first 25 rows
        tbody.innerHTML = '';
        
        let currentPage = page;
        let currentTbody = tbody;
        const rowsPerPage = 25;
        let rowsAddedToCurrentPage = 0;
        
        for (let i = 0; i < originalRows.length; i++) {
          // If current page is full, create continuation page
          if (rowsAddedToCurrentPage >= rowsPerPage) {
            console.log('Creating continuation page:', nextPageNum);
            currentPage = createContinuationPage(currentPage, nextPageNum);
            currentTbody = currentPage.querySelector('tbody');
            nextPageNum++;
            rowsAddedToCurrentPage = 0;
          }
          
          // Add row to current page
          const rowClone = originalRows[i].cloneNode(true);
          currentTbody.appendChild(rowClone);
          rowsAddedToCurrentPage++;
        }
        
        console.log('Pagination completed. Total rows:', originalRows.length, 'Pages created:', nextPageNum - (isTotalPortfolio ? 3 : 4));
      }

      // Run pagination for tables with many rows
      const cashFlowCount = ${JSON.stringify(recentCashFlows.length)};
      console.log('Cash flow count:', cashFlowCount);
      
      if (cashFlowCount > 25) {
        console.log('Running pagination...');
        setTimeout(() => { 
          try { 
            paginateLongTable('cash-flows-table'); 
          } catch(e) { 
            console.error('Pagination error:', e); 
          } 
        }, 500);
      } else {
        console.log('No pagination needed - row count is', cashFlowCount);
      }

      // Auto-print after render
      setTimeout(() => { try { window.print(); } catch(e) {} }, 800);
    })();
  </script>
</body>
</html>
  `;

  return html;
}