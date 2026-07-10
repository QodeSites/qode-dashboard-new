// Client-side PDF generation for the Investment Summary report.
//
// Renders the same HTML/CSS the backend PDF pipeline uses
// (investment-summary-pdf/src/templates/report.html, driven by Jinja2 +
// Playwright there) into a hidden iframe, then triggers the browser's native
// print dialog — same pattern as app/holding-summary/page.tsx's
// handleDownloadPDF. Kept in its own module so the print/HTML-building logic
// doesn't bloat page.tsx.
import type { MultiStrategyInvestmentData, StrategyInvestmentData } from "@/app/lib/parse-investment-pdf";

export interface LiveAllocationRow {
  label: string;
  hybrid: number;
  debt: number;
  equity: number;
  cash: number;
  total: number;
}

export interface LiveAllocation {
  currentAllocation: LiveAllocationRow[];
  currentAccountAllocation: { label: string; amount: number; percent: number; isTotal?: boolean }[];
}

interface PrintReportParams {
  data: MultiStrategyInvestmentData;
  activeSummary: StrategyInvestmentData;
  activeHoldings: {
    equity: MultiStrategyInvestmentData["currentEquityHoldings"];
    mf: MultiStrategyInvestmentData["currentMfHoldings"];
  };
  activeTransactions: {
    equity: MultiStrategyInvestmentData["equityTransactions"];
    mf: MultiStrategyInvestmentData["mfTransactions"];
    cash: MultiStrategyInvestmentData["cashTransactions"];
  };
  activeProfitRedeployment: MultiStrategyInvestmentData["profitRedeployment"];
  liveAllocation: LiveAllocation | null;
  selectedStrategy: string;
  fmt: (n: number) => string;
}

// CSS ported 1:1 from investment-summary-pdf/src/templates/report.html (the
// Playwright-rendered backend template) so the browser-print output matches
// the existing PDF's look — same fonts, colors, table/badge styling.
// -webkit-print-color-adjust/print-color-adjust are required here (report.html
// doesn't need them — Playwright's page.pdf({ printBackground: true }) forces
// background colors regardless); native window.print() drops all background
// colors unless this is set, since Chrome's print dialog otherwise defaults
// "Background graphics" off.
function buildCss(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    html, body { background-color: rgb(239, 236, 211); }
    body {
      font-family: 'Lato', Helvetica, Arial, sans-serif;
      font-size: 9pt;
      color: #1a1a1a;
      line-height: 1.4;
    }
    /* Top/bottom stay on @page (Chrome's print engine reserves this on
       every printed page); left/right is 0 here and handled instead by
       .report-body's horizontal padding, since that's a single continuous
       box and its left/right edges are naturally the same on every page —
       whereas its own top/bottom padding would only land on the first and
       last printed page, leaving pages in between with no breathing room. */
    @page { size: A4 portrait; margin: 18mm 0 20mm 0; }
    .report-body { padding: 0 10mm; }

    .report-header { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:4mm; margin-bottom:5mm; }
    .report-header .header-left h1 { font-family:'Playfair Display', Georgia, serif; font-size:26pt; font-weight:900; margin:0; color:#1a1a1a; letter-spacing:-0.5px; }
    .report-header .header-left p { font-family:'Playfair Display', Georgia, serif; font-size:11pt; margin:1px 0 0 0; color:#555; font-weight:400; }
    .report-header .header-right { text-align:right; font-size:8.5pt; color:#555; line-height:1.6; padding-top:14pt; }

    .section { margin-bottom:5mm; page-break-inside:avoid; }
    .section-title { font-family:'Playfair Display', Georgia, serif; font-size:13pt; font-weight:700; color:#1a1a1a; margin:0 0 3mm 0; padding:0; }

    .summary-table-wrap { margin-bottom:4mm; }
    .summary-table-wrap table, .section > table { border-bottom:1.5px solid #C9A84C; }

    table { width:100%; border-collapse:collapse; table-layout:auto; border:none; background-color:transparent; }
    th { background-color:#004C2F; color:#ffffff; font-weight:700; font-size:7.5pt; padding:4px 8px; text-align:center; border:none; border-bottom:1px solid #004C2F; }
    th:first-child { text-align:left; }
    td { padding:4px 8px; border:none; border-bottom:1px solid #e0dbc8; font-size:8pt; background-color:transparent; word-wrap:break-word; overflow:visible; text-align:center; vertical-align:middle; }
    td:first-child { text-align:left; }
    tr:nth-child(even) td { background-color: rgba(255, 255, 255, 0.35); }
    tr.total td { background-color:transparent; font-weight:bold; border-top:1.5px solid #004C2F; border-bottom:none; color:#1a1a1a; text-align:center; }
    tr.total td:first-child { text-align:left; }
    tr.sub-header td { background-color:#004C2F; color:#ffffff; font-weight:bold; font-size:8pt; text-align:left; }

    .status-pass { color:#1a7a3a; font-weight:bold; }
    .status-fail { color:#c0392b; font-weight:bold; }

    .badge { display:inline-block; padding:2px 10px; border-radius:3px; font-size:7pt; font-weight:700; color:#fff; white-space:nowrap; text-align:center; }
    .badge-equity { background-color:#004C2F; }
    .badge-debt { background-color:#C9A84C; color:#1a1a1a; }
    .badge-hybrid { background-color:#7a6c3a; }
    .badge-strategy { display:inline-block; padding:2px 10px; border-radius:3px; font-size:7pt; font-weight:700; color:#004C2F; background-color:rgba(0, 76, 47, 0.12); white-space:nowrap; text-align:center; }

    .page-break { page-break-before: always; }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }

    .report-footer { margin-top:6mm; padding-top:3mm; font-size:7pt; color:#888; text-align:center; }
  `;
}

const typeBadge = (v: string) => {
  const norm = (v || "").trim().toLowerCase();
  if (norm === "equity") return `<span class="badge badge-equity">Equity</span>`;
  if (norm === "debt") return `<span class="badge badge-debt">Debt</span>`;
  if (norm === "hybrid") return `<span class="badge badge-hybrid">Hybrid</span>`;
  return v || "";
};
const strategyBadge = (v: string) => (v ? `<span class="badge-strategy">${v}</span>` : "");

export function printInvestmentSummaryReport(params: PrintReportParams): Promise<void> {
  const { data, activeSummary, activeHoldings, activeTransactions, activeProfitRedeployment, liveAllocation, selectedStrategy, fmt } = params;

  const money = (n: number) => `${n < 0 ? "-" : ""}₹ ${fmt(Math.abs(n))}`;
  const todayStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const twoCol = (title: string, rows: { label: string; value: number; isBold?: boolean }[]) => `
    <div class="section">
      <div class="section-title">${title}</div>
      <div class="summary-table-wrap">
      <table>
        <colgroup><col style="width:70%;" /><col style="width:30%;" /></colgroup>
        <thead><tr><th>Particulars</th><th>Amount</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr${r.isBold ? ' class="total"' : ""}>
              <td>${r.label}</td><td>${money(r.value)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
      </div>
    </div>`;

  const threeCol = (
    title: string,
    headers: [string, string, string],
    rows: { a: string; b: string; c: string; isBold?: boolean }[],
  ) => rows.length ? `
    <div class="section">
      <div class="section-title">${title}</div>
      <div class="summary-table-wrap">
      <table>
        <colgroup><col style="width:50%;" /><col style="width:25%;" /><col style="width:25%;" /></colgroup>
        <thead><tr><th>${headers[0]}</th><th>${headers[1]}</th><th>${headers[2]}</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr${r.isBold ? ' class="total"' : ""}>
              <td>${r.a}</td><td>${r.b}</td><td>${r.c}</td>
            </tr>`).join("")}
        </tbody>
      </table>
      </div>
    </div>` : "";

  const genericTable = (title: string, headers: string[], rows: string[][]) => rows.length ? `
    <div class="section">
      <div class="section-title">${title}</div>
      <table>
        <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  // ── Live PMS tables (Sarla/Satidham only) ──────────────────────────────
  const liveAllocationHTML = liveAllocation && selectedStrategy === "ALL" ? `
    ${threeCol("Current Account Allocation", ["Particulars", "Amount", "%"],
      liveAllocation.currentAccountAllocation.map((r) => ({
        a: r.label, b: money(r.amount), c: `${r.percent.toFixed(2)}%`, isBold: r.isTotal,
      })))}
    <div class="section">
      <div class="section-title">Current Allocation</div>
      <table>
        <thead><tr>
          <th>Scheme</th><th>Hybrid</th><th>Debt</th><th>Equity</th><th>Cash + Liquidcase</th><th>Total</th>
        </tr></thead>
        <tbody>
          ${liveAllocation.currentAllocation.map((row) => {
            const isGrand = row.label === "Grand total";
            return `<tr${isGrand ? ' class="total"' : ""}>
              <td>${row.label}</td>
              <td>${money(row.hybrid)}</td>
              <td>${money(row.debt)}</td>
              <td>${money(row.equity)}</td>
              <td>${money(row.cash)}</td>
              <td>${money(row.total)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>` : "";

  // ── Profit Redeployment Summary ─────────────────────────────────────────
  const profitRedeploymentHTML = activeProfitRedeployment.length ? `
    <div class="section">
      <div class="section-title">Profit Redeployment Summary</div>
      <table>
        <thead><tr><th>Strategy</th><th>Profits</th></tr></thead>
        <tbody>
          ${activeProfitRedeployment.map((row) => row.isHeader ? `
              <tr class="sub-header"><td colspan="2">${row.strategy}</td></tr>`
            : `<tr${row.isTotal ? ' class="total"' : ""}>
                <td>${row.strategy}</td>
                <td class="${row.profits >= 0 ? "status-pass" : "status-fail"}">${money(row.profits)}</td>
              </tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  // ── Current Account Summary (from parsed xlsx, distinct from live PMS) ──
  const currentAccountSummaryHTML = threeCol(
    "Current Account Summary (Report)",
    ["Particulars", "Amount", "%"],
    activeSummary.currentAccountSummary.map((r) => ({
      a: r.particulars, b: money(r.amount), c: `${r.percent.toFixed(2)}%`,
    })),
  );

  // Skipped when the live PMS "Current Allocation" table is shown below —
  // that table already includes this exact Zerodha Hybrid/Debt/Equity/Cash
  // breakdown (as its "Zerodha" row) plus the PMS row and grand total, so
  // showing both was a duplicate of the same numbers.
  const showLegacyBifurcation = !(liveAllocation && selectedStrategy === "ALL");
  const holdingsBifurcationHTML = showLegacyBifurcation ? threeCol(
    "Holdings Bifurcation",
    ["Type", "Amount", "%"],
    activeSummary.holdingsBifurcation.map((r) => ({
      a: typeBadge(r.type), b: money(r.amount), c: `${r.percent.toFixed(2)}%`,
    })),
  ) : "";

  // ── Holdings & Transactions ──────────────────────────────────────────────
  const filterByStrategy = <T extends { strategy: string }>(arr: T[]) =>
    selectedStrategy === "ALL" ? arr : arr.filter((r) => r.strategy === selectedStrategy);

  const holdingsHTML = [
    genericTable("Current Equity Holdings", ["Stock Name", "Type", "Broker", "Exchange", "Strategy", "Amount"],
      activeHoldings.equity.map((h) => [h.name, typeBadge(h.type), h.broker, h.exchange, strategyBadge(h.strategy), money(h.amount)])),
    genericTable("Current Mutual Fund Holdings", ["Fund Name", "Type", "Broker", "Strategy", "Amount"],
      activeHoldings.mf.map((h) => [h.name, typeBadge(h.type), h.broker, strategyBadge(h.strategy), money(h.amount)])),
    genericTable("Historical Equity Holdings", ["Stock Name", "Type", "Strategy", "Amount"],
      filterByStrategy(data.historicalEquityHoldings).map((h) => [h.name, typeBadge(h.type), strategyBadge(h.strategy), money(h.amount)])),
    genericTable("Historical Mutual Fund Holdings", ["Fund Name", "Type", "Strategy", "Amount"],
      filterByStrategy(data.historicalMfHoldings).map((h) => [h.name, typeBadge(h.type), strategyBadge(h.strategy), money(h.amount)])),
  ].join("");

  const transactionsHTML = [
    genericTable("Equity Transactions", ["Stock Name", "Capital Flow", "Date", "Strategy", "Amount"],
      activeTransactions.equity.map((t) => [t.name, t.capitalFlow, t.date, strategyBadge(t.strategy), money(t.amount)])),
    genericTable("Cash Transactions", ["Date", "Transaction Type", "Strategy", "Amount"],
      activeTransactions.cash.map((t) => [t.date, t.transactionType, strategyBadge(t.strategy), money(t.amount)])),
    genericTable("Mutual Fund Transactions", ["Fund Name", "Capital Flow", "Date", "Strategy", "Amount"],
      activeTransactions.mf.map((t) => [t.name, t.capitalFlow, t.date, strategyBadge(t.strategy), money(t.amount)])),
  ].join("");

  const headerHTML = `
    <div class="report-header">
      <div class="header-left">
        <h1>Investment Summary</h1>
        <p>${data.clientName}${selectedStrategy !== "ALL" ? ` — Scheme ${selectedStrategy}` : ""}</p>
      </div>
      <div class="header-right">
        Generated: ${todayStr}<br/>
        ${data.dataAsOfDate ? `Data as of: <strong>${data.dataAsOfDate}</strong>` : ""}
      </div>
    </div>`;

  const contentHTML = `
    ${headerHTML}
    ${twoCol("Amount Invested", [
      { label: "Holdings", value: activeSummary.amountInvested.holdings },
      { label: "Cash", value: activeSummary.amountInvested.cash },
      { label: "Total", value: activeSummary.amountInvested.total, isBold: true },
    ])}
    ${twoCol("Cash Investment Summary", [
      { label: "Total Cash Added", value: activeSummary.cashInvestmentSummary.totalCashAdded },
      { label: "Profits & Capital Withdrawn", value: activeSummary.cashInvestmentSummary.profitsAndCapitalWithdrawn },
      { label: "Net Cash Balance", value: activeSummary.cashInvestmentSummary.netCashBalance, isBold: true },
    ])}
    ${twoCol("Holdings Investment Summary", [
      { label: "Total Holdings Added", value: activeSummary.holdingsInvestmentSummary.totalHoldingsAdded },
      { label: "Total Holdings Withdrawn", value: activeSummary.holdingsInvestmentSummary.totalHoldingsWithdrawn },
      { label: "Net Holding Balance", value: activeSummary.holdingsInvestmentSummary.netHoldingBalance, isBold: true },
    ])}
    ${holdingsBifurcationHTML}
    ${liveAllocationHTML}
    ${currentAccountSummaryHTML}
    ${profitRedeploymentHTML}
    ${holdingsHTML}
    ${transactionsHTML}
    <div class="report-footer">Qode</div>
  `;

  const fullHTML = `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Lato:wght@400;700&display=swap" rel="stylesheet">
    <style>${buildCss()}</style></head><body><div class="report-body">${contentHTML}</div></body></html>`;

  return new Promise((resolve) => {
    const existingFrame = document.getElementById("investment-summary-print-frame") as HTMLIFrameElement | null;
    if (existingFrame) existingFrame.remove();

    const iframe = document.createElement("iframe");
    iframe.id = "investment-summary-print-frame";
    iframe.style.position = "fixed";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    iframe.style.left = "-9999px";
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc || !iframe.contentWindow) {
      iframe.remove();
      resolve();
      return;
    }
    const iframeWin = iframe.contentWindow;

    iframeDoc.open();
    iframeDoc.write(fullHTML);
    iframeDoc.close();

    // Race fonts.ready against a timeout — if the Google Fonts request is
    // blocked (network policy, offline, ad-blocker) fonts.ready can hang
    // indefinitely and the print dialog would never open.
    const fontsReady = iframeDoc.fonts.ready.catch(() => undefined);
    const timeout = new Promise<void>((r) => setTimeout(r, 2000));

    Promise.race([fontsReady, timeout]).then(() => {
      try {
        iframeWin.print();
      } catch (e) {
        console.error("Print error:", e);
      }
      // Delay removal — some browsers still read from the iframe while the
      // print dialog is rendering; removing it immediately can blank/break
      // the preview.
      setTimeout(() => {
        iframe.remove();
        resolve();
      }, 500);
    });
  });
}
