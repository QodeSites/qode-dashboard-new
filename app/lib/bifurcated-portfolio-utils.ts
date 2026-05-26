import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import {
  EMPTY_FROZEN_DATA,
  SHILPA_FROZEN_DATA,
  VIKRAM_FROZEN_DATA,
} from "./bifurcated-portfolio-data";

// ==================== Interfaces ====================

interface CashFlow {
  date: string;
  amount: number;
  dividend: number;
}

interface QuarterlyPnL {
  [year: string]: {
    percent: { q1: string; q2: string; q3: string; q4: string; total: string };
    cash: { q1: string; q2: string; q3: string; q4: string; total: string };
    yearCash: string;
  };
}

interface MonthlyPnL {
  [year: string]: {
    months: {
      [month: string]: { percent: string; cash: string; capitalInOut: string };
    };
    totalPercent: number;
    totalCash: number;
    totalCapitalInOut: number;
  };
}

interface PortfolioData {
  amountDeposited: string;
  currentExposure: string;
  return: string;
  totalProfit: string;
  trailingReturns: Record<string, number | null | string>;
  drawdown: string;
  maxDrawdown: string;
  equityCurve: { date: string; nav: number }[];
  drawdownCurve: { date: string; drawdown: number }[];
  quarterlyPnl: QuarterlyPnL;
  monthlyPnl: MonthlyPnL;
  cashFlows: CashFlow[];
  strategyName: string;
}

interface Metadata {
  icode: string;
  accountCount: number;
  lastUpdated: string;
  filtersApplied: {
    accountType: string | null;
    broker: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  inceptionDate: string;
  dataAsOfDate: string;
  strategyName: string;
  isActive: boolean;
}

interface PortfolioResponse {
  data: PortfolioData;
  metadata: Metadata;
}

interface SchemeTagConfig {
  depositTag: string;
  navTag: string;
  startDate: Date;
}

export interface PortfolioConfig {
  current: string;
  metrics: string;
  nav: string;
  isActive: boolean;
  // When set, this scheme uses its own system tags + inception date instead of
  // the client-level depositSystemTag/navSystemTag/newStartDate. Required for
  // parallel-running active schemes (e.g. Dinesh's QYE++ alongside QAW++).
  tags?: SchemeTagConfig;
  // When true, the scheme card's "Amount Invested" displays 0 regardless of
  // the live computed value. Used for fully-wound-down schemes where the
  // closing withdrawal nets the historical seed deposit (e.g. Dinesh's QTF).
  // Does NOT affect Total Portfolio aggregation — those still use real cash
  // flows from this scheme.
  displayAmountInvestedAsZero?: boolean;
}

export interface FrozenSchemeData {
  data: PortfolioData;
  metadata: Metadata;
}

export interface ClientConfig {
  clientName: string;
  defaultQcode: string;
  accountCode: string;
  oldSchemeName: string;
  newSchemeName: string;
  oldFinalNav: number;
  newStartDate: Date;
  depositSystemTag: string;
  navSystemTag: string;
  // Old scheme's DB system tags — when these match depositSystemTag/navSystemTag,
  // the DB has continuous data under one tag and "Total Portfolio" can use a single
  // query. When they differ (e.g. Dinesh), we must combine frozen + DB data.
  oldSchemeDepositTag: string;
  oldSchemeNavTag: string;
  // When set, the client's master_sheet queries are redirected to
  // bifurcated_master_sheet_test (a superset with the same columns), and the
  // "Total Portfolio" view's NAV curve + PnL are sourced from this system_tag —
  // an authoritative single continuous curve that replaces the frozen+rebased
  // splice. Cash flows, amount deposited, latest exposure, and individual
  // scheme views keep their existing tags.
  qodeTotalPortfolioTag?: string;
  portfolioMapping: Record<string, PortfolioConfig>;
}

// ==================== Per-Client Config Imports ====================

import { DINESH_CONFIG } from "./clients/dinesh";
import { SHILPA_CONFIG } from "./clients/shilpa";
import { VIKRAM_CONFIG } from "./clients/vikram";
import { ARWANI_CONFIG } from "./clients/arwani";
import { ASHWIN_CONFIG } from "./clients/ashwin";

// ==================== Helper: defineBifurcatedClient ====================
// Builder for the Arwani/Ashwin "multi-parallel-active-schemes" pattern.
// Input vocabulary mirrors the data team's tag spec (profit / exposure /
// inceptionDate). The helper synthesizes the verbose ClientConfig with all
// sentinel fields filled in. Use for new bifurcated_master_sheet_test clients
// that have no inactive scheme and use "Qode Total Portfolio" as the aggregate.
// For clients with inactive schemes (e.g. Dinesh's QTF) use the verbose
// ClientConfig directly.

export interface DefineBifurcatedClientInput {
  name: string;
  qcode: string;
  schemes: Record<
    string,
    {
      inceptionDate: string; // YYYY-MM-DD
      exposure: string;      // system_tag for current/metrics (the "exposure" tag)
      profit: string;        // system_tag for nav (the "profit" tag)
    }
  >;
  // Optional overrides — rarely needed.
  qodeTotalPortfolioTag?: string; // default: "Qode Total Portfolio"
  accountCode?: string;            // default: "" (field is vestigial here)
}

export function defineBifurcatedClient(
  input: DefineBifurcatedClientInput
): ClientConfig {
  const schemeNames = Object.keys(input.schemes);
  if (schemeNames.length === 0) {
    throw new Error(
      `defineBifurcatedClient: ${input.name} declares no schemes`
    );
  }
  const firstSchemeName = schemeNames[0];
  const firstScheme = input.schemes[firstSchemeName];

  const portfolioMapping: Record<string, PortfolioConfig> = {
    "Total Portfolio": {
      current: "Total Portfolio",
      metrics: "Total Portfolio",
      nav: "Total Portfolio",
      isActive: true,
    },
  };
  for (const [schemeName, scheme] of Object.entries(input.schemes)) {
    portfolioMapping[schemeName] = {
      current: scheme.exposure,
      metrics: scheme.exposure,
      nav: scheme.profit,
      isActive: true,
      tags: {
        depositTag: scheme.exposure,
        navTag: scheme.profit,
        startDate: new Date(scheme.inceptionDate),
      },
    };
  }

  return {
    clientName: input.name,
    defaultQcode: input.qcode,
    accountCode: input.accountCode ?? "",
    oldSchemeName: "__no_old_scheme__",
    newSchemeName: firstSchemeName,
    oldFinalNav: 100,
    newStartDate: new Date(firstScheme.inceptionDate),
    depositSystemTag: firstScheme.exposure,
    navSystemTag: firstScheme.exposure,
    oldSchemeDepositTag: "__no_old_deposit_tag__",
    oldSchemeNavTag: "__no_old_nav_tag__",
    qodeTotalPortfolioTag:
      input.qodeTotalPortfolioTag ?? "Qode Total Portfolio",
    portfolioMapping,
  };
}

// ==================== Client Configurations ====================


// ==================== Engine ====================

class BifurcatedPortfolioEngine {
  private config: ClientConfig;
  private frozenData: FrozenSchemeData;

  constructor(config: ClientConfig, frozenData: FrozenSchemeData) {
    this.config = config;
    this.frozenData = frozenData;
  }

  // Whether old+new schemes share the same DB deposit tag (single query covers both periods)
  private get sharedDepositTag(): boolean {
    return this.config.oldSchemeDepositTag === this.config.depositSystemTag;
  }

  // Whether old+new schemes share the same DB NAV tag (single query covers both periods)
  private get sharedNavTag(): boolean {
    return this.config.oldSchemeNavTag === this.config.navSystemTag;
  }

  // Redirects master_sheet reads to bifurcated_master_sheet_test when the client
  // opts in via qodeTotalPortfolioTag. The bifurcated table is a superset (same
  // columns, same rows + the "Qode Total Portfolio" authoritative curve). `any`
  // sidesteps the minor Decimal-precision type differences between the two
  // Prisma models — we only read columns that exist in both.
  private get msTable(): any {
    return this.config.qodeTotalPortfolioTag
      ? prisma.bifurcated_master_sheet_test
      : prisma.master_sheet;
  }

  private normalizeDate(date: Date | string): string {
    if (typeof date === "string") return date.split("T")[0];
    return date.toISOString().split("T")[0];
  }

  private getPortfolioNames(scheme: string): PortfolioConfig {
    return (
      this.config.portfolioMapping[scheme] || {
        current: "",
        metrics: "",
        nav: "",
        isActive: false,
      }
    );
  }

  // Returns per-scheme tags when configured (e.g. Dinesh's QYE++), else falls
  // back to client-level defaults. Enables parallel-running active schemes
  // under one client — each with its own tags and inception date.
  private getSchemeTagsAndDate(scheme: string): SchemeTagConfig {
    const pm = this.config.portfolioMapping[scheme];
    if (pm?.tags) return pm.tags;
    return {
      depositTag: this.config.depositSystemTag,
      navTag: this.config.navSystemTag,
      startDate: this.config.newStartDate,
    };
  }

  // True when the scheme has its own per-scheme tags — always requires a date
  // filter on queries (isolated parallel scheme, not a shared client-level tag
  // that spans both old and new periods).
  private hasPerSchemeTags(scheme: string): boolean {
    return !!this.config.portfolioMapping[scheme]?.tags;
  }

  // Non-aggregate, non-frozen scheme keys — excludes "Total Portfolio" (the
  // aggregate view) and oldSchemeName (the frozen-data sentinel/old scheme).
  // Used to aggregate Total Portfolio's cash flows and per-month capital-in/out
  // across every scheme. Inactive schemes (e.g. Dinesh's QTF, now sourced
  // live from the DB) ARE included — their historical cash flows still
  // belong to the portfolio's lifetime totals.
  private getAggregatedSchemeKeys(): string[] {
    return Object.keys(this.config.portfolioMapping).filter((k) => {
      return k !== "Total Portfolio" && k !== this.config.oldSchemeName;
    });
  }

  // Whether the scheme should be treated as a "fresh active scheme" — i.e.
  // start from NAV=100 with a prepended baseline day. Covers newSchemeName
  // (today's QAW++ for Dinesh, QYE++ for Shilpa/Vikram) and any additional
  // parallel scheme with its own per-scheme tags (Dinesh's QYE++).
  private isFreshActiveScheme(scheme: string): boolean {
    return (
      scheme === this.config.newSchemeName || this.hasPerSchemeTags(scheme)
    );
  }

  // ==================== Database Fetching Methods (READ-ONLY) ====================

  private async getAmountDeposited(
    qcode: string,
    scheme: string
  ): Promise<number> {
    if (scheme === this.config.oldSchemeName) return 0;

    if (scheme === "Total Portfolio") {
      // Always derive from combined cash flows (frozen old + DB new) —
      // the DB may not have old period capital_in_out entries even when
      // deposit tags are shared.
      const cashFlows = await this.getCashFlows(qcode, "Total Portfolio");
      return cashFlows.reduce((sum, flow) => sum + flow.amount, 0);
    }

    const schemeTags = this.getSchemeTagsAndDate(scheme);
    const hasOwnTags = this.hasPerSchemeTags(scheme);
    const depositSum = await this.msTable.aggregate({
      where: {
        qcode,
        system_tag: schemeTags.depositTag,
        // Per-scheme tags (QYE++): always date-filter — it's an isolated
        // parallel scheme. Client-level tag shared with old scheme
        // (Shilpa/Vikram): no date filter. Client-level tag not shared
        // (Dinesh's QAW++): date-filter.
        ...(hasOwnTags || !this.sharedDepositTag
          ? { date: { gte: schemeTags.startDate } }
          : {}),
        capital_in_out: { not: null },
      },
      _sum: { capital_in_out: true },
    });
    return Number(depositSum._sum.capital_in_out) || 0;
  }

  private async getLatestExposure(
    qcode: string,
    scheme: string
  ): Promise<{
    portfolioValue: number;
    drawdown: number;
    nav: number;
    date: Date;
  } | null> {
    if (scheme === this.config.oldSchemeName) {
      return {
        portfolioValue: 0,
        drawdown: parseFloat(this.frozenData.data.drawdown),
        nav: this.frozenData.data.equityCurve.at(-1)?.nav || 0,
        date: new Date(this.frozenData.metadata.dataAsOfDate),
      };
    }

    if (scheme === "Total Portfolio") {
      if (this.config.qodeTotalPortfolioTag) {
        // For Dinesh/Arwani, "Current Portfolio Value" sources from the
        // literal "Zerodha Total Portfolio" tag's latest portfolio_value
        // column (NOT this.config.depositSystemTag — Arwani's deposit tag is
        // "QYE++ Zerodha Total Portfolio"). NAV and drawdown still come from
        // the Qode Total Portfolio curve, read separately.
        const [zerodhaRecord, qtpRecord] = await Promise.all([
          this.msTable.findFirst({
            where: {
              qcode,
              system_tag: "Zerodha Total Portfolio",
            },
            orderBy: { date: "desc" },
            select: { portfolio_value: true, date: true },
          }),
          this.msTable.findFirst({
            where: {
              qcode,
              system_tag: this.config.qodeTotalPortfolioTag,
            },
            orderBy: { date: "desc" },
            select: { drawdown: true, nav: true, date: true },
          }),
        ]);
        if (!zerodhaRecord && !qtpRecord) return null;
        return {
          portfolioValue: Number(zerodhaRecord?.portfolio_value) || 0,
          drawdown: Math.abs(Number(qtpRecord?.drawdown) || 0),
          nav: Number(qtpRecord?.nav) || 0,
          date: zerodhaRecord?.date || qtpRecord?.date || new Date(),
        };
      }

      // Fallback for clients without a Qode Total Portfolio tag
      // (Shilpa/Vikram): delegate to the new scheme — the latest exposure
      // is from the current active period.
      return this.getLatestExposure(qcode, this.config.newSchemeName);
    }

    const schemeTags = this.getSchemeTagsAndDate(scheme);
    const record = await this.msTable.findFirst({
      where: {
        qcode,
        system_tag: schemeTags.depositTag,
        date: { gte: schemeTags.startDate },
      },
      orderBy: { date: "desc" },
      select: {
        portfolio_value: true,
        drawdown: true,
        nav: true,
        date: true,
      },
    });

    if (!record) return null;
    return {
      portfolioValue: Number(record.portfolio_value) || 0,
      drawdown: Math.abs(Number(record.drawdown) || 0),
      nav: Number(record.nav) || 0,
      date: record.date,
    };
  }

  private async getHistoricalData(
    qcode: string,
    scheme: string
  ): Promise<
    {
      date: Date;
      nav: number;
      prevNav: number | null;
      drawdown: number;
      pnl: number;
      capitalInOut: number;
    }[]
  > {
    if (scheme === this.config.oldSchemeName) {
      return this.frozenData.data.equityCurve.map((entry) => {
        const drawdownEntry = this.frozenData.data.drawdownCurve.find(
          (d) => d.date === entry.date
        );
        return {
          date: new Date(entry.date),
          nav: entry.nav,
          prevNav: null,
          drawdown: drawdownEntry?.drawdown || 0,
          pnl: 0,
          capitalInOut: 0,
        };
      });
    }

    if (scheme === "Total Portfolio") {
      if (this.config.qodeTotalPortfolioTag) {
        // Authoritative single continuous curve — no frozen splice, no rebasing.
        // Prepend a NAV=100 baseline one day before the first row because Qode's
        // day-1 row has prev_nav=100 (the inception baseline). This keeps the
        // equity curve's visual "starts at 100" convention and anchors the
        // sinceInception day-count correctly.
        const rows = await this.msTable.findMany({
          where: {
            qcode,
            system_tag: this.config.qodeTotalPortfolioTag,
            nav: { not: null },
          },
          select: {
            date: true,
            nav: true,
            prev_nav: true,
            drawdown: true,
            pnl: true,
            capital_in_out: true,
          },
          orderBy: { date: "asc" },
        });

        const result = rows.map((entry: any) => ({
          date: entry.date as Date,
          nav: Number(entry.nav) || 0,
          prevNav: entry.prev_nav != null ? Number(entry.prev_nav) : null,
          drawdown: Math.abs(Number(entry.drawdown) || 0),
          pnl: Number(entry.pnl) || 0,
          capitalInOut: Number(entry.capital_in_out) || 0,
        }));

        if (result.length > 0) {
          const baselineDate = new Date(result[0].date);
          baselineDate.setUTCDate(baselineDate.getUTCDate() - 1);
          result.unshift({
            date: baselineDate,
            nav: 100,
            prevNav: null,
            drawdown: 0,
            pnl: 0,
            capitalInOut: 0,
          });
        }

        return result;
      }

      const oldData = await this.getHistoricalData(
        qcode,
        this.config.oldSchemeName
      );
      const newData = await this.getHistoricalData(
        qcode,
        this.config.newSchemeName
      );

      const rebaseMultiplier = this.config.oldFinalNav / 100;
      const rebasedNewData = newData.map((entry) => ({
        ...entry,
        nav: entry.nav * rebaseMultiplier,
      }));

      return [...oldData, ...rebasedNewData];
    }

    const schemeTags = this.getSchemeTagsAndDate(scheme);
    const data = await this.msTable.findMany({
      where: {
        qcode,
        system_tag: schemeTags.navTag,
        date: { gte: schemeTags.startDate },
        nav: { not: null },
      },
      select: {
        date: true,
        nav: true,
        prev_nav: true,
        drawdown: true,
        pnl: true,
        capital_in_out: true,
      },
      orderBy: { date: "asc" },
    });

    return data.map((entry: any) => ({
      date: entry.date,
      nav: Number(entry.nav) || 0,
      prevNav: entry.prev_nav ? Number(entry.prev_nav) : null,
      drawdown: Math.abs(Number(entry.drawdown) || 0),
      pnl: Number(entry.pnl) || 0,
      capitalInOut: Number(entry.capital_in_out) || 0,
    }));
  }

  private async getCashFlows(
    qcode: string,
    scheme: string
  ): Promise<CashFlow[]> {
    if (scheme === this.config.oldSchemeName) {
      return this.frozenData.data.cashFlows;
    }

    if (scheme === "Total Portfolio") {
      // Combine frozen old scheme + every active parallel scheme. This
      // picks up QYE++'s seed deposit in addition to QAW++'s cash flows
      // for Dinesh; unchanged for Shilpa/Vikram (one active scheme each).
      const oldCashFlows = await this.getCashFlows(
        qcode,
        this.config.oldSchemeName
      );
      const aggregatedSchemeFlows = await Promise.all(
        this.getAggregatedSchemeKeys().map((s) =>
          this.getCashFlows(qcode, s)
        )
      );
      return (
        [oldCashFlows, ...aggregatedSchemeFlows].flat() as CashFlow[]
      ).sort((a, b) => a.date.localeCompare(b.date));
    }

    const schemeTags = this.getSchemeTagsAndDate(scheme);
    const data = await this.msTable.findMany({
      where: {
        qcode,
        system_tag: schemeTags.depositTag,
        // Always filter by date — only show cash flows from the scheme's
        // inception onwards.
        date: { gte: schemeTags.startDate },
        AND: [
          { capital_in_out: { not: null } },
          { capital_in_out: { not: new Decimal(0) } },
        ],
      },
      select: { date: true, capital_in_out: true },
      orderBy: { date: "asc" },
    });

    return data.map((entry: any) => ({
      date: this.normalizeDate(entry.date),
      amount: entry.capital_in_out?.toNumber() || 0,
      dividend: 0,
    }));
  }

  private async getTotalProfit(
    qcode: string,
    scheme: string
  ): Promise<number> {
    if (scheme === this.config.oldSchemeName) {
      return parseFloat(this.frozenData.data.totalProfit);
    }

    if (scheme === "Total Portfolio") {
      if (this.config.qodeTotalPortfolioTag) {
        // Qode Total Portfolio's pnl column is authoritative for the combined
        // view — no need to merge frozen + DB.
        const profitSum = await this.msTable.aggregate({
          where: {
            qcode,
            system_tag: this.config.qodeTotalPortfolioTag,
            pnl: { not: null },
          },
          _sum: { pnl: true },
        });
        return Number(profitSum._sum.pnl) || 0;
      }

      // Always combine frozen old + DB new — the DB may not have old
      // period PnL entries even when NAV tags are shared.
      const oldProfit = await this.getTotalProfit(
        qcode,
        this.config.oldSchemeName
      );
      const newProfit = await this.getTotalProfit(
        qcode,
        this.config.newSchemeName
      );
      return oldProfit + newProfit;
    }

    const schemeTags = this.getSchemeTagsAndDate(scheme);
    const profitSum = await this.msTable.aggregate({
      where: {
        qcode,
        system_tag: schemeTags.navTag,
        date: { gte: schemeTags.startDate },
        pnl: { not: null },
      },
      _sum: { pnl: true },
    });
    return Number(profitSum._sum.pnl) || 0;
  }

  // ==================== Calculation Methods ====================

  private calculateDrawdownMetrics(
    equityCurve: { date: string; nav: number }[]
  ): {
    mdd: number;
    currentDD: number;
    ddCurve: { date: string; value: number }[];
  } {
    if (equityCurve.length === 0)
      return { mdd: 0, currentDD: 0, ddCurve: [] };

    let peak = equityCurve[0].nav;
    let mdd = 0;
    const ddCurve: { date: string; value: number }[] = [];

    for (const point of equityCurve) {
      if (point.nav > peak) peak = point.nav;
      const drawdown = ((point.nav - peak) / peak) * 100;
      ddCurve.push({ date: point.date, value: drawdown });
      if (drawdown < mdd) mdd = drawdown;
    }

    const currentDD =
      ddCurve.length > 0 ? ddCurve[ddCurve.length - 1].value : 0;
    return { mdd, currentDD, ddCurve };
  }

  private async calculatePortfolioReturns(
    qcode: string,
    scheme: string
  ): Promise<number> {
    if (scheme === this.config.oldSchemeName) {
      return parseFloat(this.frozenData.data.return);
    }

    if (scheme === "Total Portfolio") {
      if (this.config.qodeTotalPortfolioTag) {
        // Qode's first row has prev_nav=100 (the inception baseline) and
        // represents day 1 of the account. Use prev_nav as the return
        // denominator and anchor the day-count to inception (one day before
        // first row) so day-1 NAV moves are captured and the span matches
        // the prepended baseline in the equity curve.
        const firstNavRecord = await this.msTable.findFirst({
          where: {
            qcode,
            system_tag: this.config.qodeTotalPortfolioTag,
            nav: { not: null },
          },
          orderBy: { date: "asc" },
          select: { nav: true, prev_nav: true, date: true },
        });
        const latestNavRecord = await this.msTable.findFirst({
          where: {
            qcode,
            system_tag: this.config.qodeTotalPortfolioTag,
            nav: { not: null },
          },
          orderBy: { date: "desc" },
          select: { nav: true, date: true },
        });

        if (!firstNavRecord || !latestNavRecord) return 0;

        const initialNav =
          firstNavRecord.prev_nav != null
            ? Number(firstNavRecord.prev_nav)
            : 100;
        const finalNav = Number(latestNavRecord.nav) || 0;
        const inceptionDate = new Date(firstNavRecord.date);
        inceptionDate.setUTCDate(inceptionDate.getUTCDate() - 1);
        const days =
          (latestNavRecord.date.getTime() - inceptionDate.getTime()) /
          (1000 * 60 * 60 * 24);

        if (days < 365) {
          return (finalNav / initialNav - 1) * 100;
        }
        return (Math.pow(finalNav / initialNav, 365 / days) - 1) * 100;
      }

      if (this.sharedNavTag) {
        // Tags match — query DB directly for first/last NAV (Shilpa/Vikram)
        const firstNavRecord = await this.msTable.findFirst({
          where: { qcode, system_tag: this.config.navSystemTag, nav: { not: null } },
          orderBy: { date: "asc" },
          select: { nav: true, date: true },
        });
        const latestNavRecord = await this.msTable.findFirst({
          where: { qcode, system_tag: this.config.navSystemTag, nav: { not: null } },
          orderBy: { date: "desc" },
          select: { nav: true, date: true },
        });

        if (!firstNavRecord || !latestNavRecord) return 0;

        const initialNav = 100;
        const finalNav = Number(latestNavRecord.nav) || 0;
        const days =
          (latestNavRecord.date.getTime() - firstNavRecord.date.getTime()) /
          (1000 * 60 * 60 * 24);

        if (days < 365) {
          return (finalNav / initialNav - 1) * 100;
        } else {
          return (Math.pow(finalNav / initialNav, 365 / days) - 1) * 100;
        }
      } else {
        // Tags differ — use rebased combined data (Dinesh)
        const historicalData = await this.getHistoricalData(qcode, scheme);
        if (historicalData.length < 2) return 0;

        const firstNav = historicalData[0].nav;
        const lastNav = historicalData[historicalData.length - 1].nav;
        const days =
          (historicalData[historicalData.length - 1].date.getTime() -
            historicalData[0].date.getTime()) /
          (1000 * 60 * 60 * 24);

        if (days < 365) {
          return (lastNav / firstNav - 1) * 100;
        } else {
          return (Math.pow(lastNav / firstNav, 365 / days) - 1) * 100;
        }
      }
    }

    const historicalData = await this.getHistoricalData(qcode, scheme);
    if (historicalData.length < 2) return 0;

    const originalFirstNav = historicalData[0].nav;
    const lastNav = historicalData[historicalData.length - 1].nav;
    const days =
      (historicalData[historicalData.length - 1].date.getTime() -
        historicalData[0].date.getTime()) /
      (1000 * 60 * 60 * 24);

    // For different-tag clients (Dinesh's QAW++) and per-scheme parallel
    // schemes (Dinesh's QYE++), the DB tag starts fresh at NAV ~100, so use
    // 100 as base. For shared-tag clients (Shilpa/Vikram), the DB NAV
    // continues from the old scheme's final value (~110/~106), so use
    // prevNav (previous day's close) as the base — using the first day's
    // close would drop day 1's return.
    const firstNav =
      scheme === this.config.newSchemeName && this.sharedNavTag
        ? (historicalData[0].prevNav ?? originalFirstNav)
        : this.isFreshActiveScheme(scheme)
          ? 100
          : originalFirstNav;

    if (days < 365) {
      return (lastNav / firstNav - 1) * 100;
    } else {
      return (Math.pow(lastNav / firstNav, 365 / days) - 1) * 100;
    }
  }

  // Raw DB NAV data for "Total Portfolio" trailing returns — mirrors old flow's getHistoricalData
  private async getRawHistoricalNav(
    qcode: string
  ): Promise<{ date: string; nav: number }[]> {
    const data = await this.msTable.findMany({
      where: {
        qcode,
        system_tag: this.config.navSystemTag,
        nav: { not: null },
        drawdown: { not: null },
      },
      select: { date: true, nav: true },
      orderBy: { date: "asc" },
    });

    const result = data.map((entry: any) => ({
      date: this.normalizeDate(entry.date),
      nav: Number(entry.nav) || 0,
    }));

    // Prepend NAV=100 if first entry isn't 100, matching old flow
    if (result.length > 0 && result[0].nav !== 100) {
      const firstDate = new Date(result[0].date);
      firstDate.setUTCDate(firstDate.getUTCDate() - 1);
      result.unshift({
        date: firstDate.toISOString().split("T")[0],
        nav: 100,
      });
    }

    return result;
  }

  private async calculateTrailingReturns(
    qcode: string,
    scheme: string,
    drawdownMetrics: { mdd: number; currentDD: number }
  ): Promise<Record<string, number | null | string>> {
    if (scheme === this.config.oldSchemeName) {
      return this.frozenData.data.trailingReturns;
    }

    // For "Total Portfolio" with shared tags: use raw DB NAV (no rebasing) to match old flow
    // For "Total Portfolio" with different tags: use rebased combined data (Dinesh)
    const useRawDbNav = scheme === "Total Portfolio" && this.sharedNavTag;
    const useRebasedData = scheme === "Total Portfolio" && !this.sharedNavTag;
    const historicalData = (useRawDbNav)
      ? null
      : await this.getHistoricalData(qcode, scheme);
    const normalizedData = useRawDbNav
      ? await this.getRawHistoricalNav(qcode)
      : (historicalData || []).map((entry) => ({ date: this.normalizeDate(entry.date), nav: entry.nav }))
          .filter((entry) => entry.date)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const emptyReturns = {
      "5d": null,
      "10d": null,
      "15d": null,
      "1m": null,
      "3m": null,
      "6m": null,
      "1y": null,
      "2y": null,
      "5y": null,
      sinceInception: null,
      MDD: drawdownMetrics.mdd,
      currentDD: drawdownMetrics.currentDD,
    };

    if (normalizedData.length === 0) return emptyReturns;

    const lastEntry = normalizedData[normalizedData.length - 1];
    const lastNav = lastEntry.nav;
    const currentDate = lastEntry.date;
    const oldestDate = normalizedData[0].date;
    const dataRangeDays =
      (new Date(currentDate).getTime() - new Date(oldestDate).getTime()) /
      (1000 * 60 * 60 * 24);

    const periods: Record<string, number | null> = {
      "5d": 5,
      "10d": 10,
      "15d": 15,
      "1m": 30,
      "3m": 90,
      "6m": 180,
      "1y": 365,
      "2y": 730,
      "5y": 1825,
      sinceInception: null,
    };

    const returns: Record<string, number | null | string> = {};

    for (const [period, targetCount] of Object.entries(periods)) {
      if (period === "sinceInception") {
        // For shared-tag new scheme, use prevNav (previous day's close) as
        // the base. For everything else, use 100 (scheme starts at NAV 100).
        const firstNav =
          scheme === this.config.newSchemeName && this.sharedNavTag
            ? (historicalData?.[0]?.prevNav ?? normalizedData[0].nav)
            : 100;
        if (!firstNav) {
          returns[period] = null;
        } else if (dataRangeDays > 365) {
          // Use CAGR for sinceInception when > 1 year, matching old flow
          returns[period] = (Math.pow(lastNav / firstNav, 365 / dataRangeDays) - 1) * 100;
        } else {
          returns[period] = (lastNav / firstNav - 1) * 100;
        }
        continue;
      }

      const requiredDays = targetCount as number;
      if (requiredDays > dataRangeDays) {
        returns[period] = null;
        continue;
      }

      const targetDate = new Date(currentDate);
      targetDate.setDate(targetDate.getDate() - requiredDays);

      if (targetDate < new Date(oldestDate)) {
        returns[period] = null;
        continue;
      }

      const targetTime = targetDate.getTime();
      let candidate: { date: string; nav: number } | null = null;

      for (const dataPoint of normalizedData) {
        const dataTime = new Date(dataPoint.date).getTime();
        if (dataTime <= targetTime) candidate = dataPoint;
        else break;
      }

      if (!candidate) {
        for (const dataPoint of normalizedData) {
          const dataTime = new Date(dataPoint.date).getTime();
          if (dataTime >= targetTime) {
            candidate = dataPoint;
            break;
          }
        }
      }

      if (!candidate) {
        returns[period] = null;
        continue;
      }

      const candidateTime = new Date(candidate.date).getTime();
      const daysDiff =
        Math.abs(candidateTime - targetTime) / (1000 * 60 * 60 * 24);
      const maxAllowedDiff = requiredDays <= 30 ? 7 : 30;
      if (daysDiff > maxAllowedDiff) {
        returns[period] = null;
        continue;
      }

      returns[period] = (lastNav / candidate.nav - 1) * 100;
    }

    returns["MDD"] = drawdownMetrics.mdd;
    returns["currentDD"] = drawdownMetrics.currentDD;
    return returns;
  }

  private async calculateMonthlyPnL(
    qcode: string,
    scheme: string
  ): Promise<MonthlyPnL> {
    if (scheme === this.config.oldSchemeName) {
      return this.frozenData.data.monthlyPnl;
    }

    if (scheme === "Total Portfolio") {
      const unifiedHistoricalData = await this.getHistoricalData(
        qcode,
        "Total Portfolio"
      );
      const navBasedResult = this.computeMonthlyPnLFromHistoricalData(
        unifiedHistoricalData,
        false
      );

      // When Qode Total Portfolio is authoritative, percent and cash (pnl) are
      // already correct from the unified Qode curve — only capitalInOut needs
      // the frozen-old + per-active-scheme merge because Qode's capital_in_out
      // column is zero by design (cash movements are tracked on the original
      // tags, including each parallel scheme's own tag).
      const cashFromQodeTag = !!this.config.qodeTotalPortfolioTag;
      const oldMonthlyPnl = this.frozenData.data.monthlyPnl;
      const aggregatedMonthlyPnls = await Promise.all(
        this.getAggregatedSchemeKeys().map((s) =>
          this.calculateMonthlyPnL(qcode, s)
        )
      );

      const getMonthValue = (
        pnl: MonthlyPnL,
        year: string,
        month: string,
        field: "cash" | "capitalInOut"
      ): number => {
        const m = pnl[year]?.months[month];
        return m && m[field] !== "-" ? parseFloat(m[field]) : 0;
      };

      for (const year of Object.keys(navBasedResult)) {
        let yearTotalCash = 0;
        let yearTotalCapitalInOut = 0;

        for (const month of Object.keys(navBasedResult[year].months)) {
          if (navBasedResult[year].months[month].percent === "-") continue;

          const oldCapitalInOut = getMonthValue(
            oldMonthlyPnl,
            year,
            month,
            "capitalInOut"
          );
          const aggregatedCapitalInOut = aggregatedMonthlyPnls.reduce(
            (sum, pnl) => sum + getMonthValue(pnl, year, month, "capitalInOut"),
            0
          );
          const totalCapitalInOut = oldCapitalInOut + aggregatedCapitalInOut;

          if (!cashFromQodeTag) {
            const oldCash = getMonthValue(oldMonthlyPnl, year, month, "cash");
            const aggregatedCash = aggregatedMonthlyPnls.reduce(
              (sum, pnl) => sum + getMonthValue(pnl, year, month, "cash"),
              0
            );
            navBasedResult[year].months[month].cash = (
              oldCash + aggregatedCash
            ).toFixed(2);
          }
          navBasedResult[year].months[month].capitalInOut =
            totalCapitalInOut.toFixed(2);

          yearTotalCash +=
            parseFloat(navBasedResult[year].months[month].cash) || 0;
          yearTotalCapitalInOut += totalCapitalInOut;
        }

        navBasedResult[year].totalCash = yearTotalCash;
        navBasedResult[year].totalCapitalInOut = yearTotalCapitalInOut;
      }

      return navBasedResult;
    }

    const historicalData = await this.getHistoricalData(qcode, scheme);
    // Fresh active schemes (newSchemeName + per-scheme parallel schemes like
    // QYE++) use prevNav=100 on day 1 as the month-1 starting baseline.
    return this.computeMonthlyPnLFromHistoricalData(
      historicalData,
      this.isFreshActiveScheme(scheme)
    );
  }

  private computeMonthlyPnLFromHistoricalData(
    historicalData: {
      date: Date;
      nav: number;
      prevNav: number | null;
      pnl: number;
      capitalInOut: number;
    }[],
    useFirstPrevNav: boolean
  ): MonthlyPnL {
    const monthlyPnl: MonthlyPnL = {};
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    const grouped: Record<
      string,
      Record<
        string,
        {
          startNav: number;
          endNav: number;
          pnl: number;
          capitalInOut: number;
        }
      >
    > = {};
    let isFirstMonthSet = false;

    for (let i = 0; i < historicalData.length; i++) {
      const entry = historicalData[i];
      const date = new Date(entry.date);
      const year = date.getFullYear().toString();
      const month = monthNames[date.getMonth()];

      if (!grouped[year]) grouped[year] = {};
      if (!grouped[year][month]) {
        let startNav: number;
        if (!isFirstMonthSet && useFirstPrevNav) {
          // For different-tag (Dinesh): prevNav is null → falls back to 100.
          // For shared-tag (Shilpa/Vikram): prevNav is the old scheme's
          // final NAV (~110/~106), which is the correct base for the new
          // scheme's first period.
          startNav = historicalData[0]?.prevNav ?? 100;
          isFirstMonthSet = true;
        } else if (i > 0) {
          startNav = historicalData[i - 1]?.nav || entry.nav;
        } else {
          startNav = entry.nav;
        }

        grouped[year][month] = {
          startNav,
          endNav: entry.nav,
          pnl: entry.pnl,
          capitalInOut: entry.capitalInOut,
        };
      } else {
        grouped[year][month].endNav = entry.nav;
        grouped[year][month].pnl += entry.pnl;
        grouped[year][month].capitalInOut += entry.capitalInOut;
      }
    }

    for (const year of Object.keys(grouped).sort()) {
      monthlyPnl[year] = {
        months: {},
        totalPercent: 0,
        totalCash: 0,
        totalCapitalInOut: 0,
      };

      let compoundedReturn = 1;
      let hasValidData = false;

      for (const month of monthNames) {
        if (grouped[year]?.[month]) {
          const data = grouped[year][month];
          const percent = (data.endNav / data.startNav - 1) * 100;
          monthlyPnl[year].months[month] = {
            percent: percent.toFixed(2),
            cash: data.pnl.toFixed(2),
            capitalInOut: data.capitalInOut.toFixed(2),
          };
          compoundedReturn *= 1 + percent / 100;
          hasValidData = true;
          monthlyPnl[year].totalCash += data.pnl;
          monthlyPnl[year].totalCapitalInOut += data.capitalInOut;
        } else {
          monthlyPnl[year].months[month] = {
            percent: "-",
            cash: "-",
            capitalInOut: "-",
          };
        }
      }

      if (hasValidData && compoundedReturn !== 1) {
        monthlyPnl[year].totalPercent = Number(
          ((compoundedReturn - 1) * 100).toFixed(2)
        );
      } else if (hasValidData) {
        monthlyPnl[year].totalPercent = 0;
      }
    }

    return monthlyPnl;
  }

  private async calculateQuarterlyPnL(
    qcode: string,
    scheme: string
  ): Promise<QuarterlyPnL> {
    if (scheme === this.config.oldSchemeName) {
      return this.frozenData.data.quarterlyPnl;
    }

    if (scheme === "Total Portfolio") {
      const unifiedHistoricalData = await this.getHistoricalData(
        qcode,
        "Total Portfolio"
      );
      const navBasedResult = this.computeQuarterlyPnLFromHistoricalData(
        unifiedHistoricalData,
        false
      );

      // When Qode Total Portfolio is authoritative, per-quarter cash (pnl) is
      // already correct from the unified Qode curve — just recompute year totals.
      if (this.config.qodeTotalPortfolioTag) {
        for (const year of Object.keys(navBasedResult)) {
          let yearTotalCash = 0;
          for (const q of ["q1", "q2", "q3", "q4"] as const) {
            yearTotalCash +=
              parseFloat(navBasedResult[year].cash[q] || "0") || 0;
          }
          navBasedResult[year].cash.total = yearTotalCash.toFixed(2);
          navBasedResult[year].yearCash = yearTotalCash.toFixed(2);
        }
        return navBasedResult;
      }

      const oldQuarterlyPnl = this.frozenData.data.quarterlyPnl;
      const newQuarterlyPnl = await this.calculateQuarterlyPnL(
        qcode,
        this.config.newSchemeName
      );

      for (const year of Object.keys(navBasedResult)) {
        let yearTotalCash = 0;

        for (const q of ["q1", "q2", "q3", "q4"] as const) {
          if (
            navBasedResult[year].percent[q] === "0" &&
            !oldQuarterlyPnl[year]?.cash[q] &&
            !newQuarterlyPnl[year]?.cash[q]
          )
            continue;

          const oldCash =
            parseFloat(oldQuarterlyPnl[year]?.cash[q] || "0") || 0;
          const newCash =
            parseFloat(newQuarterlyPnl[year]?.cash[q] || "0") || 0;
          const totalCash = oldCash + newCash;

          navBasedResult[year].cash[q] = totalCash.toFixed(2);
          yearTotalCash += totalCash;
        }

        navBasedResult[year].cash.total = yearTotalCash.toFixed(2);
        navBasedResult[year].yearCash = yearTotalCash.toFixed(2);
      }

      return navBasedResult;
    }

    const historicalData = await this.getHistoricalData(qcode, scheme);
    // Fresh active schemes (newSchemeName + per-scheme parallel schemes like
    // QYE++) use prevNav=100 on day 1 as the quarter-1 starting baseline.
    return this.computeQuarterlyPnLFromHistoricalData(
      historicalData,
      this.isFreshActiveScheme(scheme)
    );
  }

  private computeQuarterlyPnLFromHistoricalData(
    historicalData: {
      date: Date;
      nav: number;
      prevNav: number | null;
      pnl: number;
      capitalInOut: number;
    }[],
    useFirstPrevNav: boolean
  ): QuarterlyPnL {
    const quarterlyPnl: QuarterlyPnL = {};
    const grouped: Record<
      string,
      Record<string, { startNav: number; endNav: number; pnl: number }>
    > = {};
    let isFirstQuarterSet = false;

    for (let i = 0; i < historicalData.length; i++) {
      const entry = historicalData[i];
      const date = new Date(entry.date);
      const year = date.getFullYear().toString();
      const quarter = `q${Math.floor(date.getMonth() / 3) + 1}`;

      if (!grouped[year]) grouped[year] = {};
      if (!grouped[year][quarter]) {
        let startNav: number;
        if (!isFirstQuarterSet && useFirstPrevNav) {
          // For different-tag (Dinesh): prevNav is null → falls back to 100.
          // For shared-tag (Shilpa/Vikram): prevNav is the old scheme's
          // final NAV (~110/~106), which is the correct base for the new
          // scheme's first period.
          startNav = historicalData[0]?.prevNav ?? 100;
          isFirstQuarterSet = true;
        } else if (i > 0) {
          startNav = historicalData[i - 1]?.nav || entry.nav;
        } else {
          startNav = entry.nav;
        }

        grouped[year][quarter] = {
          startNav,
          endNav: entry.nav,
          pnl: entry.pnl,
        };
      } else {
        grouped[year][quarter].endNav = entry.nav;
        grouped[year][quarter].pnl += entry.pnl;
      }
    }

    for (const year of Object.keys(grouped).sort()) {
      quarterlyPnl[year] = {
        percent: { q1: "0", q2: "0", q3: "0", q4: "0", total: "0" },
        cash: { q1: "0", q2: "0", q3: "0", q4: "0", total: "0" },
        yearCash: "0",
      };

      let compoundedReturn = 1;
      let hasValidData = false;
      let yearTotalCash = 0;

      for (const q of ["q1", "q2", "q3", "q4"]) {
        if (grouped[year]?.[q]) {
          const data = grouped[year][q];
          const percent = (data.endNav / data.startNav - 1) * 100;
          quarterlyPnl[year].percent[
            q as keyof (typeof quarterlyPnl)[string]["percent"]
          ] = percent.toFixed(2);
          quarterlyPnl[year].cash[
            q as keyof (typeof quarterlyPnl)[string]["cash"]
          ] = data.pnl.toFixed(2);
          compoundedReturn *= 1 + percent / 100;
          hasValidData = true;
          yearTotalCash += data.pnl;
        }
      }

      quarterlyPnl[year].percent.total = hasValidData
        ? ((compoundedReturn - 1) * 100).toFixed(2)
        : "0";
      quarterlyPnl[year].cash.total = yearTotalCash.toFixed(2);
      quarterlyPnl[year].yearCash = yearTotalCash.toFixed(2);
    }

    return quarterlyPnl;
  }

  // ==================== Main GET Handler ====================

  public async handleGET(request: Request): Promise<NextResponse> {
    try {
      const results: Record<string, PortfolioResponse> = {};
      const url = new URL(request.url);
      const qcode =
        url.searchParams.get("qcode") || this.config.defaultQcode;

      // Drive the scheme list + response order from the portfolio mapping
      // (JS preserves insertion order), so adding a parallel scheme like
      // Dinesh's QYE++ auto-includes it without touching the engine.
      const schemes = Object.keys(this.config.portfolioMapping);

      for (const scheme of schemes) {
        const portfolioNames = this.getPortfolioNames(scheme);

        if (scheme === this.config.oldSchemeName) {
          results[scheme] = {
            data: this.frozenData.data,
            metadata: {
              ...this.frozenData.metadata,
              isActive: portfolioNames.isActive,
            },
          };
          continue;
        }

        const investedAmount = await this.getAmountDeposited(qcode, scheme);
        const latestExposure = await this.getLatestExposure(qcode, scheme);
        const totalProfit = await this.getTotalProfit(qcode, scheme);
        const returns = await this.calculatePortfolioReturns(qcode, scheme);
        const historicalData = await this.getHistoricalData(qcode, scheme);
        const cashFlows = await this.getCashFlows(qcode, scheme);

        const rawEquityCurve = historicalData.map((d) => ({
          date: this.normalizeDate(d.date),
          nav: d.nav,
        }));

        // Build the canonical equity curve once — used for both the displayed
        // chart and as the input to drawdown computation, so MDD/currentDD
        // anchor to the inception baseline (NAV=100) instead of the day-1
        // close. Without this, schemes that drop on day 1 (e.g. QYE++ NAV
        // 99.01 from prev_nav=100) had their peak initialized to 99.01 and
        // missed the day-1 dip itself.
        const equityCurveForDisplay = (() => {
          if (
            this.isFreshActiveScheme(scheme) &&
            rawEquityCurve.length > 0
          ) {
            const firstDate = new Date(rawEquityCurve[0].date);
            firstDate.setDate(firstDate.getDate() - 1);
            const baselineDate = firstDate.toISOString().split("T")[0];

            // Only rebase when using the client-level shared NAV tag whose
            // DB NAV continues from the old scheme's final value
            // (Shilpa/Vikram). Per-scheme tag schemes start fresh at
            // NAV ~100 — no rebase needed.
            if (
              scheme === this.config.newSchemeName &&
              this.sharedNavTag
            ) {
              const baseNav =
                historicalData[0]?.prevNav ?? rawEquityCurve[0].nav;
              const rebaseFactor = 100 / baseNav;
              const rebasedCurve = rawEquityCurve.map((p) => ({
                date: p.date,
                nav: Number((p.nav * rebaseFactor).toFixed(2)),
              }));
              return [{ date: baselineDate, nav: 100 }, ...rebasedCurve];
            }

            return [{ date: baselineDate, nav: 100 }, ...rawEquityCurve];
          }
          return rawEquityCurve;
        })();

        const drawdownMetrics = this.calculateDrawdownMetrics(
          equityCurveForDisplay
        );
        const trailingReturns = await this.calculateTrailingReturns(
          qcode,
          scheme,
          drawdownMetrics
        );
        const monthlyPnl = await this.calculateMonthlyPnL(qcode, scheme);
        const quarterlyPnl = await this.calculateQuarterlyPnL(
          qcode,
          scheme
        );

        // Per-scheme display override: e.g. Dinesh's QTF shows 0 instead of
        // its real net (negative) historical cash flow. Total Portfolio's
        // own amountDeposited is unaffected — it's derived from getCashFlows
        // ("Total Portfolio") which still includes this scheme's real flows.
        const displayedInvestedAmount = portfolioNames.displayAmountInvestedAsZero
          ? 0
          : investedAmount;

        const portfolioData: PortfolioData = {
          amountDeposited: displayedInvestedAmount.toFixed(2),
          currentExposure: latestExposure?.portfolioValue.toFixed(2) || "0",
          return: returns.toFixed(2),
          totalProfit: totalProfit.toFixed(2),
          trailingReturns,
          drawdown: drawdownMetrics.currentDD.toFixed(2),
          maxDrawdown: drawdownMetrics.mdd.toFixed(2),
          equityCurve: equityCurveForDisplay,
          // ddCurve already includes the baseline day (drawdown=0) because it
          // was computed from the prepended equity curve — no extra prepend.
          drawdownCurve: drawdownMetrics.ddCurve.map((d) => ({
            date: d.date,
            drawdown: d.value,
          })),
          quarterlyPnl,
          monthlyPnl,
          cashFlows,
          strategyName: scheme,
        };

        const metadata: Metadata = {
          icode: scheme,
          accountCount: 1,
          lastUpdated: new Date().toISOString(),
          filtersApplied: {
            accountType: null,
            broker: null,
            startDate: null,
            endDate: null,
          },
          inceptionDate:
            historicalData.length > 0
              ? this.normalizeDate(historicalData[0].date)
              : this.frozenData.metadata.inceptionDate,
          dataAsOfDate:
            latestExposure?.date.toISOString().split("T")[0] ||
            new Date().toISOString().split("T")[0],
          strategyName: scheme,
          isActive: portfolioNames.isActive,
        };

        results[scheme] = { data: portfolioData, metadata };
      }

      return NextResponse.json(results, { status: 200 });
    } catch (error) {
      console.error(
        `${this.config.clientName} Portfolio API Error:`,
        error
      );
      return NextResponse.json(
        {
          error: "Internal server error",
          message:
            error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  }
}

// ==================== Engine Instances & Exports ====================

// Dinesh's QTF (formerly frozen) is now live-DB-sourced; engine receives
// EMPTY_FROZEN_DATA so the frozen-scheme branches stay dormant.
const dineshEngine = new BifurcatedPortfolioEngine(
  DINESH_CONFIG,
  EMPTY_FROZEN_DATA
);
const shilpaEngine = new BifurcatedPortfolioEngine(
  SHILPA_CONFIG,
  SHILPA_FROZEN_DATA
);
const vikramEngine = new BifurcatedPortfolioEngine(
  VIKRAM_CONFIG,
  VIKRAM_FROZEN_DATA
);
const arwaniEngine = new BifurcatedPortfolioEngine(
  ARWANI_CONFIG,
  EMPTY_FROZEN_DATA
);
const ashwinEngine = new BifurcatedPortfolioEngine(
  ASHWIN_CONFIG,
  EMPTY_FROZEN_DATA
);

export const DineshApi = {
  GET: (req: Request) => dineshEngine.handleGET(req),
};
export const ShilpaApi = {
  GET: (req: Request) => shilpaEngine.handleGET(req),
};
export const VikramApi = {
  GET: (req: Request) => vikramEngine.handleGET(req),
};
export const ArwaniApi = {
  GET: (req: Request) => arwaniEngine.handleGET(req),
};
export const AshwinApi = {
  GET: (req: Request) => ashwinEngine.handleGET(req),
};
