/**
 * Generates bifurcated-portfolio-data.ts with frozen scheme data extracted from CSVs.
 * Usage: node scripts/generate-bifurcated-data.js > app/lib/bifurcated-portfolio-data.ts
 */

const fs = require("fs");
const path = require("path");

const CLIENTS = {
  dinesh: {
    csvPath: "data/dinesh_qtf_only_masterhseet.csv",
    navTag: "QTF Zerodha Total Portfolio",
    depositTag: "QTF Zerodha Total Portfolio",
    cutoffDate: "2026-01-09",
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
  return content.split("\n").filter((l) => l.trim()).slice(1).map((line) => {
    const c = line.split(",");
    return { systemTag: c[0]?.trim(), date: c[1]?.trim(), capitalInOut: parseFloat(c[3]) || 0, nav: parseFloat(c[4]) || 0, prevNav: parseFloat(c[5]) || 0, pnl: parseFloat(c[6]) || 0, drawdown: parseFloat(c[12]) || 0 };
  });
}

function getPrevBusinessDay(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}

function calcTrailing(ec, mdd, cdd) {
  const last = ec[ec.length - 1], lastNav = last.nav, lastDate = new Date(last.date), firstDate = new Date(ec[0].date);
  const range = (lastDate - firstDate) / 864e5;
  const periods = { "5d": 5, "10d": 10, "15d": 15, "1m": 30, "3m": 90, "6m": 180, "1y": 365, "2y": 730, "5y": 1825 };
  const ret = {};
  for (const [p, days] of Object.entries(periods)) {
    if (days > range) { ret[p] = null; continue; }
    const td = new Date(lastDate); td.setDate(td.getDate() - days);
    if (td < firstDate) { ret[p] = null; continue; }
    let cand = null;
    for (const pt of ec) { if (new Date(pt.date) <= td) cand = pt; else break; }
    if (!cand) for (const pt of ec) { if (new Date(pt.date) >= td) { cand = pt; break; } }
    if (!cand) { ret[p] = null; continue; }
    const diff = Math.abs(new Date(cand.date) - td) / 864e5;
    if (diff > (days <= 30 ? 7 : 30)) { ret[p] = null; continue; }
    ret[p] = Number(((lastNav / cand.nav - 1) * 100).toFixed(2));
  }
  ret.sinceInception = Number(((lastNav / 100 - 1) * 100).toFixed(2));
  ret.MDD = mdd; ret.currentDD = cdd;
  return ret;
}

function calcMonthly(hist) {
  const mn = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const g = {};
  for (let i = 0; i < hist.length; i++) {
    const e = hist[i], d = new Date(e.date + "T00:00:00Z"), y = d.getUTCFullYear().toString(), m = mn[d.getUTCMonth()];
    if (!g[y]) g[y] = {};
    if (!g[y][m]) { g[y][m] = { sn: i > 0 ? hist[i-1].nav : e.nav, en: e.nav, pnl: e.pnl, cio: e.capitalInOut }; }
    else { g[y][m].en = e.nav; g[y][m].pnl += e.pnl; g[y][m].cio += e.capitalInOut; }
  }
  const res = {};
  for (const y of Object.keys(g).sort()) {
    res[y] = { months: {}, totalPercent: 0, totalCash: 0, totalCapitalInOut: 0 };
    let comp = 1, hv = false;
    for (const m of mn) {
      if (g[y]?.[m]) {
        const d = g[y][m], p = ((d.en / d.sn) - 1) * 100;
        res[y].months[m] = { percent: p.toFixed(2), cash: d.pnl.toFixed(2), capitalInOut: d.cio.toFixed(2) };
        comp *= (1 + p / 100); hv = true;
        res[y].totalCash += d.pnl; res[y].totalCapitalInOut += d.cio;
      } else { res[y].months[m] = { percent: "-", cash: "-", capitalInOut: "-" }; }
    }
    res[y].totalPercent = hv ? Number(((comp - 1) * 100).toFixed(2)) : 0;
  }
  return res;
}

function calcQuarterly(hist) {
  const g = {};
  for (let i = 0; i < hist.length; i++) {
    const e = hist[i], d = new Date(e.date + "T00:00:00Z"), y = d.getUTCFullYear().toString(), q = "q" + (Math.floor(d.getUTCMonth() / 3) + 1);
    if (!g[y]) g[y] = {};
    if (!g[y][q]) { g[y][q] = { sn: i > 0 ? hist[i-1].nav : e.nav, en: e.nav, pnl: e.pnl }; }
    else { g[y][q].en = e.nav; g[y][q].pnl += e.pnl; }
  }
  const res = {};
  for (const y of Object.keys(g).sort()) {
    res[y] = { percent: { q1: "0", q2: "0", q3: "0", q4: "0", total: "0" }, cash: { q1: "0", q2: "0", q3: "0", q4: "0", total: "0" }, yearCash: "0" };
    let comp = 1, hv = false, tc = 0;
    for (const q of ["q1","q2","q3","q4"]) {
      if (g[y]?.[q]) {
        const d = g[y][q], p = ((d.en / d.sn) - 1) * 100;
        res[y].percent[q] = p.toFixed(2); res[y].cash[q] = d.pnl.toFixed(2);
        comp *= (1 + p / 100); hv = true; tc += d.pnl;
      }
    }
    res[y].percent.total = hv ? ((comp - 1) * 100).toFixed(2) : "0";
    res[y].cash.total = tc.toFixed(2); res[y].yearCash = tc.toFixed(2);
  }
  return res;
}

function extract(config) {
  const rows = parseCSV(config.csvPath);
  const navRows = rows.filter((r) => r.systemTag === config.navTag && r.date <= config.cutoffDate && r.date);
  const depositRows = rows.filter((r) => r.systemTag === config.depositTag && r.date <= config.cutoffDate && r.date);
  const bd = getPrevBusinessDay(navRows[0].date);
  const ec = [{ date: bd, nav: 100 }, ...navRows.map((r) => ({ date: r.date, nav: Number(r.nav.toFixed(2)) }))];
  const dc = [{ date: bd, drawdown: 0 }, ...navRows.map((r) => ({ date: r.date, drawdown: Number(r.drawdown.toFixed(2)) }))];
  const hist = [{ date: bd, nav: 100, prevNav: 0, drawdown: 0, pnl: 0, capitalInOut: 0 }, ...navRows.map((r) => ({ date: r.date, nav: Number(r.nav.toFixed(2)), prevNav: Number(r.prevNav.toFixed(2)), drawdown: Number(r.drawdown.toFixed(2)), pnl: Number(r.pnl.toFixed(2)), capitalInOut: Number(r.capitalInOut.toFixed(2)) }))];
  const cf = depositRows.filter((r) => r.capitalInOut !== 0).map((r) => ({ date: r.date, amount: Number(r.capitalInOut.toFixed(2)), dividend: 0 }));
  const tp = Number(navRows.reduce((s, r) => s + r.pnl, 0).toFixed(2));
  const lastNav = ec[ec.length - 1].nav, lastDate = navRows[navRows.length - 1].date;
  const days = (new Date(lastDate) - new Date(bd)) / 864e5;
  const ret = Number((days < 365 ? ((lastNav / 100) - 1) * 100 : (Math.pow(lastNav / 100, 365 / days) - 1) * 100).toFixed(2));
  let peak = 100, mdd = 0;
  for (const p of ec) { if (p.nav > peak) peak = p.nav; const dd = ((p.nav - peak) / peak) * 100; if (dd < mdd) mdd = dd; }
  mdd = Number(mdd.toFixed(2));
  const cdd = Number(dc[dc.length - 1].drawdown.toFixed(2));
  return { ec, dc, cf, tp, ret, mdd, cdd, trailing: calcTrailing(ec, mdd, cdd), monthly: calcMonthly(hist), quarterly: calcQuarterly(hist), bd, lastDate, lastNav, schemeName: config.schemeName };
}

function fmt(clientKey, data) {
  const lines = [];
  const I = "  ";

  lines.push(`export const ${clientKey.toUpperCase()}_FROZEN_DATA: FrozenSchemeData = {`);
  lines.push(`${I}data: {`);
  lines.push(`${I}${I}amountDeposited: "0.00",`);
  lines.push(`${I}${I}currentExposure: "0.00",`);
  lines.push(`${I}${I}return: "${data.ret}",`);
  lines.push(`${I}${I}totalProfit: "${data.tp}",`);
  lines.push(`${I}${I}trailingReturns: {`);
  for (const [k, v] of Object.entries(data.trailing)) {
    lines.push(`${I}${I}${I}${JSON.stringify(k)}: ${v === null ? "null" : v},`);
  }
  lines.push(`${I}${I}},`);
  lines.push(`${I}${I}drawdown: "${data.cdd}",`);
  lines.push(`${I}${I}maxDrawdown: "${data.mdd}",`);
  lines.push(`${I}${I}equityCurve: [`);
  for (const p of data.ec) lines.push(`${I}${I}${I}{ date: "${p.date}", nav: ${p.nav} },`);
  lines.push(`${I}${I}],`);
  lines.push(`${I}${I}drawdownCurve: [`);
  for (const p of data.dc) lines.push(`${I}${I}${I}{ date: "${p.date}", drawdown: ${p.drawdown} },`);
  lines.push(`${I}${I}],`);
  lines.push(`${I}${I}quarterlyPnl: ${JSON.stringify(data.quarterly, null, 6).split("\n").map((l, i) => i === 0 ? l : `${I}${I}${l}`).join("\n")},`);
  lines.push(`${I}${I}monthlyPnl: ${JSON.stringify(data.monthly, null, 6).split("\n").map((l, i) => i === 0 ? l : `${I}${I}${l}`).join("\n")},`);
  lines.push(`${I}${I}cashFlows: [`);
  for (const c of data.cf) lines.push(`${I}${I}${I}{ date: "${c.date}", amount: ${c.amount}, dividend: 0 },`);
  lines.push(`${I}${I}],`);
  lines.push(`${I}${I}strategyName: "${data.schemeName}",`);
  lines.push(`${I}},`);
  lines.push(`${I}metadata: {`);
  lines.push(`${I}${I}icode: "${data.schemeName}",`);
  lines.push(`${I}${I}accountCount: 1,`);
  lines.push(`${I}${I}lastUpdated: "${data.lastDate}T00:00:00.000Z",`);
  lines.push(`${I}${I}filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },`);
  lines.push(`${I}${I}inceptionDate: "${data.bd}",`);
  lines.push(`${I}${I}dataAsOfDate: "${data.lastDate}",`);
  lines.push(`${I}${I}strategyName: "${data.schemeName}",`);
  lines.push(`${I}${I}isActive: false,`);
  lines.push(`${I}},`);
  lines.push(`};`);
  return lines.join("\n");
}

// Generate
const d = extract(CLIENTS.dinesh);
const s = extract(CLIENTS.shilpa);
const v = extract(CLIENTS.vikram);

const header = `// Auto-generated frozen scheme data for bifurcated portfolios.
// Generated: ${new Date().toISOString()}
// Source CSVs: dinesh_qtf_only_masterhseet.csv, shilpa_old_mastersheet.csv, vikramtrading_old_mastersheet.csv
//
// DO NOT EDIT MANUALLY. Regenerate with: node scripts/generate-bifurcated-data.js > app/lib/bifurcated-portfolio-data.ts

import type { FrozenSchemeData } from "./bifurcated-portfolio-utils";

// Dinesh (QUS00072 / QAC00053) - Scheme QTF
// Inception: ${d.bd}, Last Data: ${d.lastDate}, Final NAV: ${d.lastNav}
${fmt("dinesh", d)}

// Shilpa (QUS00067 / QAC00040) - Scheme QYE+
// Inception: ${s.bd}, Last Data: ${s.lastDate}, Final NAV: ${s.lastNav}
${fmt("shilpa", s)}

// Vikram Trading (QUS00068 / QAC00043) - Scheme QYE+
// Inception: ${v.bd}, Last Data: ${v.lastDate}, Final NAV: ${v.lastNav}
${fmt("vikram", v)}
`;

process.stdout.write(header);
