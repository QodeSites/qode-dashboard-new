interface TrailingReturns {
  fiveDays?: string | null;
  tenDays?: string | null;
  fifteenDays?: string | null;
  oneMonth?: string | null;
  threeMonths?: string | null;
  sixMonths?: string | null;
  oneYear?: string | null;
  twoYears?: string | null;
  fiveYears?: string | null;
  sinceInception: string;
  MDD?: string;
  currentDD?: string;
}

interface MonthlyPnl {
  [year: string]: {
    months: { [month: string]: { percent: string; cash: string; capitalInOut: string } };
    totalPercent: number | string;
    totalCash: number;
    totalCapitalInOut: number;
  };
}

interface QuarterlyPnl {
  [year: string]: {
    percent: { q1: string; q2: string; q3: string; q4: string; total: string };
    cash: { q1: string; q2: string; q3: string; q4: string; total: string };
    yearCash: string;
  };
}

interface FeesByQuarter {
  [year: string]: { q1?: number; q2?: number; q3?: number; q4?: number };
}

interface Transaction {
  date: string;
  amount: number;
}

export interface SarlaPortfolioReportProps {
  sessionUserName: string;
  amountDeposited: number;
  currentExposure: number;
  grossProfit: number;
  totalFeesSum: number;
  quarterlyPnl: QuarterlyPnl;
  fees: FeesByQuarter;
  cashFlows: Transaction[];
}

const defaultMoneyFmt = (v: number): string =>
  v === 0
    ? "-"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(v);

const defaultDateFmt = (d: string): string => {
  const dt = new Date(d);
  return isNaN(+dt) ? d : dt.toLocaleDateString("en-IN");
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const cleaned = String(v).replace(/[%,+]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const getPnlColorClass = (v: unknown): string => {
  const n = num(v);
  if (n === null) return "neutral";
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "neutral";
};

const formatCashAmount = (v: unknown): string => {
  const n = num(v);
  return n === null ? "-" : defaultMoneyFmt(n);
};

function buildQuarterlyCashTable(
  title: string,
  quarterlyPnl: QuarterlyPnl,
  fees?: FeesByQuarter
): string {
  const years = Object.keys(quarterlyPnl).sort();
  const quarters = ["q1", "q2", "q3", "q4"] as const;

  const rows = years
    .map((year) => {
      const cashRow = quarterlyPnl[year]?.cash;
      if (!cashRow) return "";

      let netTotal = 0;
      let hasAnyQuarter = false;

      const cells = quarters
        .map((q) => {
          let rawVal = cashRow[q];
          if (fees) {
            const gross = num(rawVal);
            const feeVal = fees[year]?.[q] ?? 0;
            if (gross !== null) {
              const net = gross - feeVal;
              rawVal = net.toFixed(2);
              netTotal += net;
              hasAnyQuarter = true;
            }
          }
          return `<td class="${getPnlColorClass(rawVal)} right-align">${formatCashAmount(rawVal)}</td>`;
        })
        .join("");

      let totalVal: string;
      if (fees) {
        totalVal = hasAnyQuarter ? netTotal.toFixed(2) : cashRow.total;
      } else {
        totalVal = cashRow.total;
      }

      return `
        <tr>
          <td style="font-weight:600;">${year}</td>
          ${cells}
          <td class="${getPnlColorClass(totalVal)} right-align" style="font-weight:600;">${formatCashAmount(totalVal)}</td>
        </tr>`;
    })
    .join("");

  return `
    <div class="section-header">${title}</div>
    <div class="section no-split">
      <div class="section-content">
        <table class="quarterly-table">
          <thead>
            <tr><th>Year</th><th class="right-align">Q1</th><th class="right-align">Q2</th><th class="right-align">Q3</th><th class="right-align">Q4</th><th class="right-align">Total</th></tr>
          </thead>
          <tbody>
            ${rows.length ? rows : '<tr><td colspan="6" style="text-align:center;">No data available</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

export function buildSarlaPortfolioReportHTML(props: SarlaPortfolioReportProps): string {
  const {
    sessionUserName,
    amountDeposited,
    currentExposure,
    grossProfit,
    totalFeesSum,
    quarterlyPnl,
    fees,
    cashFlows,
  } = props;

  const netProfit = grossProfit - totalFeesSum;
  const formatter = defaultMoneyFmt;
  const dateFormatter = defaultDateFmt;

  const generatedDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Stat cards — show both gross and net
  const statItems = [
    { name: "Amount Invested", value: formatter(amountDeposited) },
    { name: "Current Portfolio Value", value: formatter(currentExposure) },
    { name: "Returns (Gross)", value: formatter(grossProfit) },
    { name: "Returns (Net of Costs)", value: formatter(netProfit) },
  ];

  // Cash flows
  const cashFlowTotals = cashFlows.reduce(
    (acc, tx) => {
      const amount = Number(tx.amount);
      if (amount > 0) acc.totalIn += amount;
      else if (amount < 0) acc.totalOut += amount;
      acc.netFlow += amount;
      return acc;
    },
    { totalIn: 0, totalOut: 0, netFlow: 0 }
  );

  const recentCashFlows = cashFlows.map((t) => ({
    date: dateFormatter(t.date),
    amount: Number(t.amount),
  }));

  const isTotalPortfolio = true;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Portfolio Report - ${sessionUserName}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Lato:wght@300;400;500;600&family=Inria+Serif:wght@300;400;700&display=swap" rel="stylesheet">
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
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
    .stat-card { background: #EFECD3; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #DABD38; }
    .stat-card h4 { font-size: 11px; color: #666; margin-bottom: 8px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-card .value { font-family: 'Inria Serif'; font-size: 18px; font-weight: 500; color: #02422B; }
    .section { background: #EFECD3; border-radius: 8px; margin-bottom: 15px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .section.no-split { page-break-inside: avoid; -webkit-column-break-inside: avoid; break-inside: avoid; }
    .section.allow-break { page-break-inside: auto; -webkit-column-break-inside: auto; break-inside: auto; }
    .section-header { color: #02422B; padding: 12px 0px; font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 600; }
    .section-content { padding: 0px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background-color: #02422B; color: white; padding: 10px 8px; text-align: center; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 8px; text-align: center; border-bottom: 1px solid #eee; }
    tr:nth-child(even) { background-color: rgba(255,255,255,0.3); }
    .positive { color: #059669; }
    .negative { color: #dc2626; }
    .neutral { color: #374151; }
    .cash-flow-positive { color: #059669; font-weight: 600; }
    .cash-flow-negative { color: #dc2626; font-weight: 600; }
    .summary-row { background-color: rgba(243,244,246,0.5); font-weight: 600; }
    .right-align { text-align: right; }
    .left-align { text-align: left; }
    .note { font-size: 10px; color: #666; margin-top: 8px; margin-bottom: 4px; font-style: italic; padding: 0 4px; }
    .footer { margin-top: auto; padding-top: 15px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #666; }
    .disclaimer { font-size: 9px; color: #999; line-height: 1.4; max-width: 75%; }
    .page-number { font-family: 'Playfair Display', serif; font-size: 12px; color: #02422B; font-weight: 600; }
    @page { size: A4 portrait; margin: 0; }
    @media print {
      body, .page, .stat-card, .section, .header, th, .section-header {
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      .section.allow-break { page-break-inside: auto; -webkit-column-break-inside: auto; break-inside: auto; }
    }
  </style>
</head>
<body>

  <!-- Page 1: Summary + Quarterly P&L (Gross & Net) -->
  <div class="page">
    <div class="header">
      <div class="header-left">
        <h1>${sessionUserName}</h1>
        <p>Total Portfolio</p>
      </div>
      <div class="header-right">
        <div class="date">Generated on: ${generatedDate}</div>
      </div>
    </div>

    <div class="stats-grid">
      ${statItems.map((s) => `
        <div class="stat-card">
          <h4>${s.name}</h4>
          <div class="value">${s.value}</div>
        </div>
      `).join("")}
    </div>

    ${buildQuarterlyCashTable("Quarterly Profit and Loss — Gross (₹)", quarterlyPnl)}

    ${buildQuarterlyCashTable("Quarterly Profit and Loss — Net of Costs (₹)", quarterlyPnl, fees)}

    <div class="footer">
      <div class="disclaimer"></div>
      <div class="page-number">1 | Qode</div>
    </div>
  </div>

  <!-- Page 2: Cash Flows -->
  <div class="page">
    <div class="header">
      <div class="header-left">
        <h1>${sessionUserName}</h1>
        <p>Total Portfolio</p>
      </div>
      <div class="header-right">
        <div class="date">Generated on: ${generatedDate}</div>
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
                  ${recentCashFlows.map((flow) => `
                    <tr>
                      <td class="left-align">${flow.date}</td>
                      <td class="${flow.amount > 0 ? "cash-flow-positive" : "cash-flow-negative"} right-align">
                        ${flow.amount > 0 ? "+" : ""}${formatCashAmount(flow.amount)}
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
                    <td class="${cashFlowTotals.netFlow >= 0 ? "cash-flow-positive" : "cash-flow-negative"} right-align">
                      ${cashFlowTotals.netFlow >= 0 ? "+" : ""}${formatCashAmount(cashFlowTotals.netFlow)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div class="note" style="margin-top:15px;">
                <strong>Notes:</strong><br>
                &bull; Positive amounts represent cash inflows<br>
                &bull; Negative amounts represent cash outflows<br>
                &bull; Showing ${recentCashFlows.length} transactions
              </div>
            `
            : '<div style="text-align:center;padding:20px;color:#666;">No cash flow data available</div>'
        }
      </div>
    </div>

    <div class="footer">
      <div class="disclaimer"></div>
      <div class="page-number">2 | Qode</div>
    </div>
  </div>

  <script>
    (function(){
      const isTotalPortfolio = ${JSON.stringify(isTotalPortfolio)};
      const cashFlowCount = ${JSON.stringify(recentCashFlows.length)};

      function paginateLongTable(tableId) {
        const table = document.getElementById(tableId);
        if (!table) return;
        const page = table.closest('.page');
        if (!page) return;
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        const allRows = Array.from(tbody.querySelectorAll('tr'));
        if (allRows.length <= 20) return;
        const originalRows = allRows.map(row => row.cloneNode(true));
        let nextPageNum = 3;

        function createContinuationPage(refPage, pageNum) {
          const newPage = refPage.cloneNode(true);
          const footerPageNum = newPage.querySelector('.footer .page-number');
          if (footerPageNum) footerPageNum.textContent = pageNum + ' | Qode';
          const sectionHeader = newPage.querySelector('.section-header');
          if (sectionHeader) sectionHeader.textContent = 'Cash In / Cash Out';
          const newTbody = newPage.querySelector('tbody');
          if (newTbody) newTbody.innerHTML = '';
          if (refPage.nextSibling) refPage.parentNode.insertBefore(newPage, refPage.nextSibling);
          else refPage.parentNode.appendChild(newPage);
          return newPage;
        }

        tbody.innerHTML = '';
        let currentPage = page;
        let currentTbody = tbody;
        const rowsPerPage = 20;
        let rowsAddedToCurrentPage = 0;

        for (let i = 0; i < originalRows.length; i++) {
          if (rowsAddedToCurrentPage >= rowsPerPage) {
            currentPage = createContinuationPage(currentPage, nextPageNum);
            currentTbody = currentPage.querySelector('tbody');
            nextPageNum++;
            rowsAddedToCurrentPage = 0;
          }
          currentTbody.appendChild(originalRows[i].cloneNode(true));
          rowsAddedToCurrentPage++;
        }
      }

      if (cashFlowCount > 20) {
        setTimeout(() => { try { paginateLongTable('cash-flows-table'); } catch(e) { console.error(e); } }, 500);
      }

      setTimeout(() => { try { window.print(); } catch(e) {} }, 800);
    })();
  </script>
</body>
</html>
  `;

  return html;
}

// ============================================================
// Individual Scheme PDF
// ============================================================

export interface SarlaSchemeReportProps {
  sessionUserName: string;
  strategyName: string;
  isActive: boolean;
  amountDeposited: number;
  currentExposure: number;
  returnPercent: number;
  totalProfit: number;
  trailingReturns: TrailingReturns;
  drawdown: string;
  quarterlyPnl: QuarterlyPnl;
  monthlyPnl: MonthlyPnl;
  cashFlows: Transaction[];
}

const pctStr = (v: unknown): string => {
  const n = num(v);
  return n === null ? "-" : `${n.toFixed(2)}%`;
};

const drawdownPctStr = (v: unknown): string => {
  const n = num(v);
  if (n === null) return "-";
  return `-${Math.abs(n).toFixed(2)}%`;
};

const monthOrderFull = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function buildQuarterlyPercentTable(quarterlyPnl: QuarterlyPnl): string {
  const years = Object.keys(quarterlyPnl).sort();
  const quarters = ["q1", "q2", "q3", "q4", "total"] as const;

  const rows = years
    .map((year) => {
      const pctRow = quarterlyPnl[year]?.percent;
      if (!pctRow) return "";
      return `
        <tr>
          <td style="font-weight:600;">${year}</td>
          ${quarters.map((q) => {
            const val = pctRow[q];
            return `<td class="${getPnlColorClass(val)}">${pctStr(val)}</td>`;
          }).join("")}
        </tr>`;
    })
    .join("");

  return `
    <div class="section-header">Quarterly Profit and Loss (%)</div>
    <div class="section no-split">
      <div class="section-content">
        <table>
          <thead>
            <tr><th>Year</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Total</th></tr>
          </thead>
          <tbody>
            ${rows.length ? rows : '<tr><td colspan="6" style="text-align:center;">No data available</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

function buildMonthlyPercentTable(monthlyPnl: MonthlyPnl): string {
  const years = Object.keys(monthlyPnl).sort();
  const monthOrderShort = monthOrderFull.map((m) => m.slice(0, 3));

  const rows = years
    .map((year) => {
      const rec = monthlyPnl[year];
      const months = rec?.months || {};
      const cells = monthOrderFull
        .map((m) => {
          const val = months[m]?.percent ?? null;
          return `<td class="${getPnlColorClass(val)}">${pctStr(val)}</td>`;
        })
        .join("");
      const totalVal = rec?.totalPercent;
      return `
        <tr>
          <td style="font-weight:600;">${year}</td>
          ${cells}
          <td class="${getPnlColorClass(totalVal)}" style="font-weight:600;">${pctStr(totalVal)}</td>
        </tr>`;
    })
    .join("");

  return `
    <div class="section-header">Monthly Profit and Loss (%)</div>
    <div class="section no-split">
      <div class="section-content">
        <table>
          <thead>
            <tr>
              <th>Year</th>
              ${monthOrderShort.map((m) => `<th>${m}</th>`).join("")}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows : '<tr><td colspan="14" style="text-align:center;">No data available</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

function buildCashFlowsHTML(
  cashFlows: Transaction[],
  dateFormatter: (d: string) => string
): string {
  const cashFlowTotals = cashFlows.reduce(
    (acc, tx) => {
      const amount = Number(tx.amount);
      if (amount > 0) acc.totalIn += amount;
      else if (amount < 0) acc.totalOut += amount;
      acc.netFlow += amount;
      return acc;
    },
    { totalIn: 0, totalOut: 0, netFlow: 0 }
  );

  const flows = cashFlows.map((t) => ({
    date: dateFormatter(t.date),
    amount: Number(t.amount),
  }));

  if (!flows.length) {
    return '<div style="text-align:center;padding:20px;color:#666;">No cash flow data available</div>';
  }

  return `
    <div class="section-header">Cash In / Cash Out</div>
    <div class="section allow-break cashflow-section">
      <div class="section-content">
        <table class="cash-flows-table" id="cash-flows-table">
          <thead><tr><th class="left-align">Date</th><th class="right-align">Amount</th></tr></thead>
          <tbody>
            ${flows.map((flow) => `
              <tr>
                <td class="left-align">${flow.date}</td>
                <td class="${flow.amount > 0 ? "cash-flow-positive" : "cash-flow-negative"} right-align">
                  ${flow.amount > 0 ? "+" : ""}${formatCashAmount(flow.amount)}
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
              <td class="${cashFlowTotals.netFlow >= 0 ? "cash-flow-positive" : "cash-flow-negative"} right-align">
                ${cashFlowTotals.netFlow >= 0 ? "+" : ""}${formatCashAmount(cashFlowTotals.netFlow)}
              </td>
            </tr>
          </tbody>
        </table>
        <div class="note" style="margin-top:15px;">
          <strong>Notes:</strong><br>
          &bull; Positive amounts represent cash inflows<br>
          &bull; Negative amounts represent cash outflows<br>
          &bull; Showing ${flows.length} transactions
        </div>
      </div>
    </div>`;
}

const CSS_SHARED = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Lato', sans-serif; background-color: #EFECD3; color: #333; line-height: 1.5; font-size: 12px; }
    .page { width: 210mm; height: 297mm; padding: 5mm; margin: 0; background-color: #EFECD3; page-break-after: always; display: flex; flex-direction: column; position: relative; }
    .page:last-child { page-break-after: auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 3px solid #02422B; }
    .header-left h1 { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #02422B; margin-bottom: 5px; }
    .header-left p { font-size: 14px; color: #666; font-weight: 400; }
    .header-right { text-align: right; }
    .header-right .date { font-size: 11px; color: #666; margin-bottom: 5px; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
    .stat-card { background: #EFECD3; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #DABD38; }
    .stat-card h4 { font-size: 11px; color: #666; margin-bottom: 8px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-card .value { font-family: 'Inria Serif'; font-size: 18px; font-weight: 500; color: #02422B; }
    .section { background: #EFECD3; border-radius: 8px; margin-bottom: 15px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .section.no-split { page-break-inside: avoid; -webkit-column-break-inside: avoid; break-inside: avoid; }
    .section.allow-break { page-break-inside: auto; -webkit-column-break-inside: auto; break-inside: auto; }
    .section-header { color: #02422B; padding: 12px 0px; font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 600; }
    .section-content { padding: 0px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background-color: #02422B; color: white; padding: 10px 8px; text-align: center; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 8px; text-align: center; border-bottom: 1px solid #eee; }
    tr:nth-child(even) { background-color: rgba(255,255,255,0.3); }
    .positive { color: #059669; }
    .negative { color: #dc2626; }
    .neutral { color: #374151; }
    .cash-flow-positive { color: #059669; font-weight: 600; }
    .cash-flow-negative { color: #dc2626; font-weight: 600; }
    .summary-row { background-color: rgba(243,244,246,0.5); font-weight: 600; }
    .trailing-returns-table th:first-child, .trailing-returns-table td:first-child { text-align: left; font-weight: 500; }
    .right-align { text-align: right; }
    .left-align { text-align: left; }
    .note { font-size: 10px; color: #666; margin-top: 8px; margin-bottom: 4px; font-style: italic; padding: 0 4px; }
    .footer { margin-top: auto; padding-top: 15px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #666; }
    .disclaimer { font-size: 9px; color: #999; line-height: 1.4; max-width: 75%; }
    .page-number { font-family: 'Playfair Display', serif; font-size: 12px; color: #02422B; font-weight: 600; }
    @page { size: A4 portrait; margin: 0; }
    @media print {
      body, .page, .stat-card, .section, .header, th, .section-header {
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      .section.allow-break { page-break-inside: auto; -webkit-column-break-inside: auto; break-inside: auto; }
    }
`;

function buildHeaderHTML(userName: string, subtitle: string, generatedDate: string): string {
  return `
    <div class="header">
      <div class="header-left">
        <h1>${userName}</h1>
        <p>${subtitle}</p>
      </div>
      <div class="header-right">
        <div class="date">Generated on: ${generatedDate}</div>
      </div>
    </div>`;
}

function buildPaginationScript(cashFlowCount: number, cashFlowPageStart: number): string {
  return `
  <script>
    (function(){
      const cashFlowCount = ${JSON.stringify(cashFlowCount)};

      function paginateLongTable(tableId) {
        const table = document.getElementById(tableId);
        if (!table) return;
        const page = table.closest('.page');
        if (!page) return;
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        const allRows = Array.from(tbody.querySelectorAll('tr'));
        if (allRows.length <= 20) return;
        const originalRows = allRows.map(row => row.cloneNode(true));
        let nextPageNum = ${cashFlowPageStart + 1};

        function createContinuationPage(refPage, pageNum) {
          const newPage = refPage.cloneNode(true);
          const footerPageNum = newPage.querySelector('.footer .page-number');
          if (footerPageNum) footerPageNum.textContent = pageNum + ' | Qode';
          const sectionHeader = newPage.querySelector('.section-header');
          if (sectionHeader) sectionHeader.textContent = 'Cash In / Cash Out';
          const newTbody = newPage.querySelector('tbody');
          if (newTbody) newTbody.innerHTML = '';
          if (refPage.nextSibling) refPage.parentNode.insertBefore(newPage, refPage.nextSibling);
          else refPage.parentNode.appendChild(newPage);
          return newPage;
        }

        tbody.innerHTML = '';
        let currentPage = page;
        let currentTbody = tbody;
        const rowsPerPage = 20;
        let rowsAddedToCurrentPage = 0;

        for (let i = 0; i < originalRows.length; i++) {
          if (rowsAddedToCurrentPage >= rowsPerPage) {
            currentPage = createContinuationPage(currentPage, nextPageNum);
            currentTbody = currentPage.querySelector('tbody');
            nextPageNum++;
            rowsAddedToCurrentPage = 0;
          }
          currentTbody.appendChild(originalRows[i].cloneNode(true));
          rowsAddedToCurrentPage++;
        }
      }

      if (cashFlowCount > 20) {
        setTimeout(() => { try { paginateLongTable('cash-flows-table'); } catch(e) { console.error(e); } }, 500);
      }

      setTimeout(() => { try { window.print(); } catch(e) {} }, 800);
    })();
  </script>`;
}

export function buildSarlaSchemeReportHTML(props: SarlaSchemeReportProps): string {
  const {
    sessionUserName,
    strategyName,
    isActive,
    amountDeposited,
    currentExposure,
    returnPercent,
    totalProfit,
    trailingReturns,
    drawdown,
    quarterlyPnl,
    monthlyPnl,
    cashFlows,
  } = props;

  const formatter = defaultMoneyFmt;
  const dateFormatter = defaultDateFmt;

  const generatedDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const title = strategyName;
  const statusLabel = isActive ? "" : " (Inactive)";

  const statItems = [
    { name: "Amount Invested", value: formatter(amountDeposited) },
    { name: "Current Portfolio Value", value: formatter(currentExposure) },
    { name: "Returns (%)", value: `${returnPercent.toFixed(2)}%` },
    { name: "Returns (₹)", value: formatter(totalProfit) },
  ];

  const tr = trailingReturns;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Portfolio Report - ${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Lato:wght@300;400;500;600&family=Inria+Serif:wght@300;400;700&display=swap" rel="stylesheet">
  <style>${CSS_SHARED}</style>
</head>
<body>

  <!-- Page 1: Summary + Trailing Returns + Quarterly (₹) -->
  <div class="page">
    ${buildHeaderHTML(sessionUserName, title + statusLabel, generatedDate)}

    <div class="stats-grid">
      ${statItems.map((s) => `
        <div class="stat-card">
          <h4>${s.name}</h4>
          <div class="value">${s.value}</div>
        </div>
      `).join("")}
    </div>
    <div class="note"><strong>Returns:</strong> Returns above 1 year are annualised; Returns below 1 year are absolute.</div>

    <div class="section-header">Trailing Returns</div>
    <div class="section no-split">
      <div class="section-content">
        <table class="trailing-returns-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>10d</th><th>1m</th><th>3m</th><th>6m</th><th>1y</th><th>2y</th><th>Since Inception</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="text-align:left;font-weight:600;">Scheme (%)</td>
              <td class="${getPnlColorClass(tr.tenDays)}">${pctStr(tr.tenDays)}</td>
              <td class="${getPnlColorClass(tr.oneMonth)}">${pctStr(tr.oneMonth)}</td>
              <td class="${getPnlColorClass(tr.threeMonths)}">${pctStr(tr.threeMonths)}</td>
              <td class="${getPnlColorClass(tr.sixMonths)}">${pctStr(tr.sixMonths)}</td>
              <td class="${getPnlColorClass(tr.oneYear)}">${pctStr(tr.oneYear)}</td>
              <td class="${getPnlColorClass(tr.twoYears)}">${pctStr(tr.twoYears)}</td>
              <td class="${getPnlColorClass(tr.sinceInception)}">${pctStr(tr.sinceInception)}</td>
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
            <tr>
              <td style="font-weight:600;" class="left-align">Scheme (%)</td>
              <td class="negative right-align">${drawdownPctStr(tr.currentDD)}</td>
              <td class="negative right-align">${drawdownPctStr(tr.MDD)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    ${buildQuarterlyCashTable("Quarterly Profit and Loss (₹)", quarterlyPnl)}

    <div class="footer">
      <div class="disclaimer"></div>
      <div class="page-number">1 | Qode</div>
    </div>
  </div>

  <!-- Page 2: Quarterly (%) + Monthly (%) -->
  <div class="page">
    ${buildHeaderHTML(sessionUserName, title + statusLabel, generatedDate)}

    ${buildQuarterlyPercentTable(quarterlyPnl)}

    ${buildMonthlyPercentTable(monthlyPnl)}

    <div class="footer">
      <div class="disclaimer"></div>
      <div class="page-number">2 | Qode</div>
    </div>
  </div>

  <!-- Page 3: Cash Flows -->
  <div class="page">
    ${buildHeaderHTML(sessionUserName, title + statusLabel, generatedDate)}

    ${buildCashFlowsHTML(cashFlows, dateFormatter)}

    <div class="footer">
      <div class="disclaimer"></div>
      <div class="page-number">3 | Qode</div>
    </div>
  </div>

  ${buildPaginationScript(cashFlows.length, 3)}
</body>
</html>
  `;

  return html;
}
