/**
 * Temporary script to extract frozen scheme data from CSV files
 * and output TypeScript-formatted hardcoded data for the bifurcated portfolio engine.
 *
 * Usage: node scripts/extract-frozen-scheme-data.js
 */

const fs = require("fs");
const path = require("path");

const CLIENTS = {
  dinesh: {
    csvPath: "data/dinesh_qtf_only_masterhseet.csv",
    navTag: "QTF Zerodha Total Portfolio",
    depositTag: "QTF Zerodha Total Portfolio", // same tag for Dinesh
    cutoffDate: "2026-01-09", // last day of old scheme (inclusive)
    schemeName: "Scheme QTF",
  },
  shilpa: {
    csvPath: "data/shilpa_old_mastersheet.csv",
    navTag: "Total Portfolio Value",
    depositTag: "Zerodha Total Portfolio",
    cutoffDate: "2026-02-04",
    schemeName: "Scheme QYE+",
  },
  vikram: {
    csvPath: "data/vikramtrading_old_mastersheet.csv",
    navTag: "Total Portfolio Value",
    depositTag: "Zerodha Total Portfolio",
    cutoffDate: "2026-01-13",
    schemeName: "Scheme QYE+",
  },
};

function parseCSV(filePath) {
  const content = fs.readFileSync(path.join(process.cwd(), filePath), "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  // Skip header
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return {
      systemTag: cols[0]?.trim(),
      date: cols[1]?.trim(),
      portfolioValue: parseFloat(cols[2]) || 0,
      capitalInOut: parseFloat(cols[3]) || 0,
      nav: parseFloat(cols[4]) || 0,
      prevNav: parseFloat(cols[5]) || 0,
      pnl: parseFloat(cols[6]) || 0,
      dailyPctReturn: parseFloat(cols[7]) || 0,
      drawdown: parseFloat(cols[12]) || 0,
    };
  });
}

function getPrevBusinessDay(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  // Skip weekends
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().split("T")[0];
}

function calculateTrailingReturns(equityCurve, mdd, currentDD) {
  const last = equityCurve[equityCurve.length - 1];
  const lastNav = last.nav;
  const lastDate = new Date(last.date);
  const firstDate = new Date(equityCurve[0].date);
  const dataRangeDays = (lastDate - firstDate) / (1000 * 60 * 60 * 24);

  const periods = { "5d": 5, "10d": 10, "15d": 15, "1m": 30, "3m": 90, "6m": 180, "1y": 365, "2y": 730, "5y": 1825 };
  const returns = {};

  for (const [period, days] of Object.entries(periods)) {
    if (days > dataRangeDays) { returns[period] = null; continue; }
    const targetDate = new Date(lastDate);
    targetDate.setDate(targetDate.getDate() - days);
    if (targetDate < firstDate) { returns[period] = null; continue; }

    // Find closest data point <= targetDate
    let candidate = null;
    for (const pt of equityCurve) {
      if (new Date(pt.date) <= targetDate) candidate = pt;
      else break;
    }
    if (!candidate) {
      for (const pt of equityCurve) {
        if (new Date(pt.date) >= targetDate) { candidate = pt; break; }
      }
    }
    if (!candidate) { returns[period] = null; continue; }

    const daysDiff = Math.abs(new Date(candidate.date) - targetDate) / (1000 * 60 * 60 * 24);
    const maxAllowed = days <= 30 ? 7 : 30;
    if (daysDiff > maxAllowed) { returns[period] = null; continue; }

    returns[period] = Number(((lastNav / candidate.nav - 1) * 100).toFixed(2));
  }

  // Since inception (from baseline 100)
  returns.sinceInception = Number(((lastNav / 100 - 1) * 100).toFixed(2));
  returns.MDD = mdd;
  returns.currentDD = currentDD;
  return returns;
}

function calculateMonthlyPnl(historicalData) {
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const grouped = {};

  for (let i = 0; i < historicalData.length; i++) {
    const entry = historicalData[i];
    const d = new Date(entry.date + "T00:00:00Z");
    const year = d.getUTCFullYear().toString();
    const month = monthNames[d.getUTCMonth()];

    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][month]) {
      const startNav = i > 0 ? historicalData[i - 1].nav : entry.nav;
      grouped[year][month] = { startNav, endNav: entry.nav, pnl: entry.pnl, capitalInOut: entry.capitalInOut };
    } else {
      grouped[year][month].endNav = entry.nav;
      grouped[year][month].pnl += entry.pnl;
      grouped[year][month].capitalInOut += entry.capitalInOut;
    }
  }

  const result = {};
  for (const year of Object.keys(grouped).sort()) {
    result[year] = { months: {}, totalPercent: 0, totalCash: 0, totalCapitalInOut: 0 };
    let compounded = 1;
    let hasValid = false;

    for (const month of monthNames) {
      if (grouped[year]?.[month]) {
        const data = grouped[year][month];
        const pct = ((data.endNav / data.startNav) - 1) * 100;
        result[year].months[month] = {
          percent: pct.toFixed(2),
          cash: data.pnl.toFixed(2),
          capitalInOut: data.capitalInOut.toFixed(2),
        };
        compounded *= (1 + pct / 100);
        hasValid = true;
        result[year].totalCash += data.pnl;
        result[year].totalCapitalInOut += data.capitalInOut;
      } else {
        result[year].months[month] = { percent: "-", cash: "-", capitalInOut: "-" };
      }
    }
    result[year].totalPercent = hasValid ? Number(((compounded - 1) * 100).toFixed(2)) : 0;
  }
  return result;
}

function calculateQuarterlyPnl(historicalData) {
  const grouped = {};

  for (let i = 0; i < historicalData.length; i++) {
    const entry = historicalData[i];
    const d = new Date(entry.date + "T00:00:00Z");
    const year = d.getUTCFullYear().toString();
    const quarter = `q${Math.floor(d.getUTCMonth() / 3) + 1}`;

    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][quarter]) {
      const startNav = i > 0 ? historicalData[i - 1].nav : entry.nav;
      grouped[year][quarter] = { startNav, endNav: entry.nav, pnl: entry.pnl };
    } else {
      grouped[year][quarter].endNav = entry.nav;
      grouped[year][quarter].pnl += entry.pnl;
    }
  }

  const result = {};
  for (const year of Object.keys(grouped).sort()) {
    result[year] = {
      percent: { q1: "0", q2: "0", q3: "0", q4: "0", total: "0" },
      cash: { q1: "0", q2: "0", q3: "0", q4: "0", total: "0" },
      yearCash: "0",
    };

    let compounded = 1;
    let hasValid = false;
    let yearTotalCash = 0;

    for (const q of ["q1", "q2", "q3", "q4"]) {
      if (grouped[year]?.[q]) {
        const data = grouped[year][q];
        const pct = ((data.endNav / data.startNav) - 1) * 100;
        result[year].percent[q] = pct.toFixed(2);
        result[year].cash[q] = data.pnl.toFixed(2);
        compounded *= (1 + pct / 100);
        hasValid = true;
        yearTotalCash += data.pnl;
      }
    }

    result[year].percent.total = hasValid ? ((compounded - 1) * 100).toFixed(2) : "0";
    result[year].cash.total = yearTotalCash.toFixed(2);
    result[year].yearCash = yearTotalCash.toFixed(2);
  }
  return result;
}

function extractClientData(clientKey, config) {
  const rows = parseCSV(config.csvPath);

  // Filter NAV tag data up to cutoff
  const navRows = rows.filter(
    (r) => r.systemTag === config.navTag && r.date <= config.cutoffDate && r.date
  );

  // Filter deposit tag data up to cutoff
  const depositRows = rows.filter(
    (r) => r.systemTag === config.depositTag && r.date <= config.cutoffDate && r.date
  );

  if (navRows.length === 0) {
    console.error(`No NAV data found for ${clientKey} with tag "${config.navTag}"`);
    return null;
  }

  // Baseline: day before first data point, nav=100
  const baselineDate = getPrevBusinessDay(navRows[0].date);

  // Build equity curve with baseline
  const equityCurve = [
    { date: baselineDate, nav: 100 },
    ...navRows.map((r) => ({ date: r.date, nav: Number(r.nav.toFixed(2)) })),
  ];

  // Build drawdown curve with baseline
  const drawdownCurve = [
    { date: baselineDate, drawdown: 0 },
    ...navRows.map((r) => ({ date: r.date, drawdown: Number(r.drawdown.toFixed(2)) })),
  ];

  // Historical data for PnL calculations (includes baseline)
  const historicalData = [
    { date: baselineDate, nav: 100, prevNav: 0, drawdown: 0, pnl: 0, capitalInOut: 0 },
    ...navRows.map((r) => ({
      date: r.date,
      nav: Number(r.nav.toFixed(2)),
      prevNav: Number(r.prevNav.toFixed(2)),
      drawdown: Number(r.drawdown.toFixed(2)),
      pnl: Number(r.pnl.toFixed(2)),
      capitalInOut: Number(r.capitalInOut.toFixed(2)),
    })),
  ];

  // Cash flows from deposit tag (non-zero capitalInOut)
  const cashFlows = depositRows
    .filter((r) => r.capitalInOut !== 0)
    .map((r) => ({
      date: r.date,
      amount: Number(r.capitalInOut.toFixed(2)),
      dividend: 0,
    }));

  // Total profit from deposit tag (sum of PnL)
  const totalProfit = Number(
    depositRows.reduce((sum, r) => sum + r.pnl, 0).toFixed(2)
  );

  // Metrics
  const lastNav = equityCurve[equityCurve.length - 1].nav;
  const firstDataDate = navRows[0].date;
  const lastDataDate = navRows[navRows.length - 1].date;
  const daysDiff = (new Date(lastDataDate) - new Date(baselineDate)) / (1000 * 60 * 60 * 24);

  let returnPct;
  if (daysDiff < 365) {
    returnPct = ((lastNav / 100) - 1) * 100;
  } else {
    returnPct = (Math.pow(lastNav / 100, 365 / daysDiff) - 1) * 100;
  }
  returnPct = Number(returnPct.toFixed(2));

  // MDD and current DD
  let peak = equityCurve[0].nav;
  let mdd = 0;
  for (const pt of equityCurve) {
    if (pt.nav > peak) peak = pt.nav;
    const dd = ((pt.nav - peak) / peak) * 100;
    if (dd < mdd) mdd = dd;
  }
  mdd = Number(mdd.toFixed(2));
  const currentDD = Number(drawdownCurve[drawdownCurve.length - 1].drawdown.toFixed(2));

  // Trailing returns
  const trailingReturns = calculateTrailingReturns(equityCurve, mdd, currentDD);

  // Monthly PnL (from NAV tag historical data)
  const monthlyPnl = calculateMonthlyPnl(historicalData);

  // Quarterly PnL (from NAV tag historical data)
  const quarterlyPnl = calculateQuarterlyPnl(historicalData);

  return {
    clientKey,
    schemeName: config.schemeName,
    baselineDate,
    lastDataDate,
    finalNav: lastNav,
    equityCurve,
    drawdownCurve,
    cashFlows,
    totalProfit,
    returnPct,
    mdd,
    currentDD,
    trailingReturns,
    monthlyPnl,
    quarterlyPnl,
  };
}

function formatValue(v) {
  if (v === null) return "null";
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

function formatObject(obj, indent = 10) {
  const pad = " ".repeat(indent);
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null) lines.push(`${pad}${JSON.stringify(k)}: null,`);
    else if (typeof v === "number") lines.push(`${pad}${JSON.stringify(k)}: ${v},`);
    else lines.push(`${pad}${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  }
  return lines.join("\n");
}

function outputClientData(data) {
  console.log(`\n// ==================== ${data.clientKey.toUpperCase()} FROZEN DATA ====================\n`);
  console.log(`// Scheme: ${data.schemeName}`);
  console.log(`// Inception: ${data.baselineDate}, Last Data: ${data.lastDataDate}`);
  console.log(`// Final NAV: ${data.finalNav}, Return: ${data.returnPct}%, MDD: ${data.mdd}%, Current DD: ${data.currentDD}%`);
  console.log(`// Total Profit: ${data.totalProfit}`);

  // Equity curve
  console.log(`\n// Equity Curve (${data.equityCurve.length} points)`);
  console.log(`const ${data.clientKey.toUpperCase()}_EQUITY_CURVE = [`);
  for (const pt of data.equityCurve) {
    console.log(`  { date: "${pt.date}", nav: ${pt.nav} },`);
  }
  console.log(`];`);

  // Drawdown curve
  console.log(`\n// Drawdown Curve (${data.drawdownCurve.length} points)`);
  console.log(`const ${data.clientKey.toUpperCase()}_DRAWDOWN_CURVE = [`);
  for (const pt of data.drawdownCurve) {
    console.log(`  { date: "${pt.date}", drawdown: ${pt.drawdown} },`);
  }
  console.log(`];`);

  // Cash flows
  console.log(`\n// Cash Flows (${data.cashFlows.length} entries)`);
  console.log(`const ${data.clientKey.toUpperCase()}_CASH_FLOWS: CashFlow[] = [`);
  for (const cf of data.cashFlows) {
    console.log(`  { date: "${cf.date}", amount: ${cf.amount}, dividend: 0 },`);
  }
  console.log(`];`);

  // Trailing returns
  console.log(`\nconst ${data.clientKey.toUpperCase()}_TRAILING_RETURNS = {`);
  for (const [k, v] of Object.entries(data.trailingReturns)) {
    console.log(`  ${JSON.stringify(k)}: ${v === null ? "null" : v},`);
  }
  console.log(`};`);

  // Monthly PnL
  console.log(`\nconst ${data.clientKey.toUpperCase()}_MONTHLY_PNL: MonthlyPnL = ${JSON.stringify(data.monthlyPnl, null, 2)};`);

  // Quarterly PnL
  console.log(`\nconst ${data.clientKey.toUpperCase()}_QUARTERLY_PNL: QuarterlyPnL = ${JSON.stringify(data.quarterlyPnl, null, 2)};`);

  // Summary constants
  console.log(`\n// Key constants`);
  console.log(`// FINAL_NAV = ${data.finalNav}`);
  console.log(`// RETURN = "${data.returnPct}"`);
  console.log(`// TOTAL_PROFIT = "${data.totalProfit}"`);
  console.log(`// MDD = "${data.mdd}"`);
  console.log(`// CURRENT_DD = "${data.currentDD}"`);
  console.log(`// INCEPTION_DATE = "${data.baselineDate}"`);
  console.log(`// DATA_AS_OF_DATE = "${data.lastDataDate}"`);
}

// Main
console.log("// Auto-generated frozen scheme data");
console.log("// Generated at:", new Date().toISOString());

for (const [key, config] of Object.entries(CLIENTS)) {
  const data = extractClientData(key, config);
  if (data) outputClientData(data);
}
