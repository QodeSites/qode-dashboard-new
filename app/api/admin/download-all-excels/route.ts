import { NextResponse } from "next/server";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/app/lib/admin-utils";
import { PortfolioApi } from "@/app/lib/sarla-utils";
import { getEngineForQcode } from "@/app/lib/bifurcated-portfolio-utils";
import { findByIcode } from "@/app/lib/bifurcated-clients-registry";
import { getUserQcodes, calculatePortfolioMetrics, formatPortfolioStats } from "@/app/lib/portfolio-utils";
import { generateExcelBufferServer, fetchBenchmarkForDateRange, ServerExcelInput } from "@/components/generateExcelReportServer";

// ============================================================================
// Types
// ============================================================================

interface PortfolioEntry {
  strategyName: string;
  data: Record<string, any>;
  metadata: {
    inceptionDate?: string | null;
    dataAsOfDate?: string | null;
    isActive?: boolean;
    startDate?: string | null;
  };
  accountInfo?: {
    accountName: string;
    accountType: string;
    broker: string;
  };
}

// ============================================================================
// Helpers
// ============================================================================

// Helper to pass parameters to PortfolioApi.GET and engine.handleGET.
// These route handlers expect a Request object but only read searchParams.
// No actual HTTP connection is made — this just constructs a Request object
// in memory with the qcode in the URL. Works on any server/IP/environment.
function makeMockRequest(url: string): Request {
  return new Request(url);
}

/** Convert a raw portfolio response entry into ServerExcelInput. */
function toExcelInput(entry: PortfolioEntry, clientName: string): ServerExcelInput {
  const { data, metadata, accountInfo } = entry;
  return {
    strategyName: entry.strategyName,
    isTotalPortfolio: entry.strategyName === "Total Portfolio",
    isActive: metadata.isActive ?? true,
    clientName,
    dataAsOfDate: metadata.dataAsOfDate ?? null,
    accountInfo,
    metrics: {
      amountDeposited: parseFloat(String(data.amountDeposited)) || 0,
      currentExposure:  parseFloat(String(data.currentExposure))  || 0,
      totalProfit:      parseFloat(String(data.totalProfit))       || 0,
      totalReturn:      parseFloat(String(data.return))            || 0,
    },
    trailingReturns: (data.trailingReturns ?? {}) as Record<string, unknown>,
    cashFlows:   (data.cashFlows   ?? []) as ServerExcelInput["cashFlows"],
    monthlyPnl:  (data.monthlyPnl  ?? null) as ServerExcelInput["monthlyPnl"],
    quarterlyPnl:(data.quarterlyPnl ?? null) as ServerExcelInput["quarterlyPnl"],
  };
}

/** Fetch all portfolio strategy entries for an icode. */
async function fetchStrategies(
  icode: string,
  accounts: { qcode: string; account_name: string; account_type: string; broker: string }[]
): Promise<PortfolioEntry[]> {
  const isSarla     = icode === "QUS0007";
  const isSatidham  = icode === "QUS0010";
  const bifurcated  = findByIcode(icode);
  // Sarla / Satidham — single API call returns all schemes
  if (isSarla || isSatidham) {
    const qcode = isSarla ? "QAC00041" : "QAC00046";
    // Call PortfolioApi.GET with the qcode in the URL. No network request is made;
    // PortfolioApi.GET only extracts searchParams and queries the database directly.
    const res  = await PortfolioApi.GET(makeMockRequest(`http://localhost/api/sarla-api?qcode=${qcode}`));
    const data = await res.json();
    return Object.entries(data).map(([strategyName, portRes]: [string, any]) => ({
      strategyName,
      data:     portRes.data     ?? {},
      metadata: portRes.metadata ?? {},
    }));
  }

  // All bifurcated clients (both multi-strategy and single-strategy).
  // Their data lives in bifurcated_master_sheet_test, not master_sheet.
  if (bifurcated) {
    const engine = getEngineForQcode(bifurcated.qcode);
    if (!engine) return [];
    // Similar to Sarla/Satidham: pass qcode via URL param. No actual HTTP call.
    const res  = await engine.handleGET(makeMockRequest(`http://localhost/api/bifurcated-portfolio?qcode=${bifurcated.qcode}`));
    const data = await res.json();
    return Object.entries(data).map(([strategyName, portRes]: [string, any]) => ({
      strategyName,
      data:     portRes.data     ?? {},
      metadata: portRes.metadata ?? {},
    }));
  }

  // Regular clients — one entry per account
  const accountMap = Object.fromEntries(accounts.map((a) => [a.qcode, a]));
  const qcodes = await getUserQcodes(icode);
  const entries: PortfolioEntry[] = [];

  for (const q of qcodes) {
    try {
      const metrics = await calculatePortfolioMetrics([q]);
      if (!metrics) continue;
      const stats = formatPortfolioStats(metrics);
      const curve = (metrics as any).equityCurve ?? [];
      const acc   = accountMap[q.qcode];
      entries.push({
        strategyName: acc?.account_name || q.qcode,
        data: stats as unknown as Record<string, any>,
        metadata: {
          inceptionDate: curve[0]?.date ?? null,
          dataAsOfDate:  curve[curve.length - 1]?.date ?? null,
          isActive: true,
        },
        accountInfo: acc
          ? { accountName: acc.account_name, accountType: acc.account_type, broker: acc.broker }
          : undefined,
      });
    } catch {
      // skip failing accounts; don't abort the entire zip
    }
  }

  return entries;
}

// ============================================================================
// Route
// ============================================================================

/**
 * GET /api/admin/download-all-excels
 * GET /api/admin/download-all-excels?icode=QUS0007   ← single client
 *
 * Admin-only. Returns a .zip containing one folder per client and one
 * .xlsx per strategy inside each folder.
 */
export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const icodeFilter = searchParams.get("icode");

  try {
    // Fetch clients
    const where: Record<string, unknown> = { pooled_account_users: { some: {} } };
    if (icodeFilter) where.icode = icodeFilter;

    const clients = await prisma.clients.findMany({
      where,
      select: {
        icode: true,
        user_name: true,
        pooled_account_users: {
          select: {
            accounts: {
              select: {
                qcode: true,
                account_name: true,
                account_type: true,
                broker: true,
              },
            },
          },
        },
      },
      orderBy: { user_name: "asc" },
    });

    const masterZip  = new JSZip();
    let   totalFiles = 0;
    const errors: string[] = [];

    for (const client of clients) {
      const accounts = client.pooled_account_users.map((pau) => pau.accounts);
      let strategies: PortfolioEntry[] = [];
      try {
        strategies = await fetchStrategies(client.icode, accounts);
      } catch (e) {
        errors.push(`${client.icode} — failed to fetch strategies: ${String(e)}`);
        continue;
      }

      const clientName = (client.user_name ?? client.icode).replace(/[/\\?%*:|"<>]/g, "_");

      for (const strategy of strategies) {
        try {
          const input = toExcelInput(strategy, client.user_name ?? client.icode);

          // Fetch NIFTY 50 benchmark returns for this strategy's date range.
          // Fails silently — benchmark columns will be blank if the API is down.
          const inceptionDate = strategy.metadata.inceptionDate ?? strategy.metadata.startDate;
          if (inceptionDate && strategy.metadata.dataAsOfDate) {
            try {
              input.benchmarkReturns = await fetchBenchmarkForDateRange(
                inceptionDate,
                strategy.metadata.dataAsOfDate
              );
            } catch {
              // leave benchmarkReturns undefined — Excel shows "-" in benchmark column
            }
          }

          const buffer = await generateExcelBufferServer(input);
          // Single strategy → ClientName.xlsx
          // Multiple strategies → ClientName - StrategyName.xlsx
          const fileName = strategies.length === 1
            ? `${clientName}.xlsx`
            : `${clientName} - ${strategy.strategyName.replace(/[/\\?%*:|"<>]/g, "_")}.xlsx`;
          masterZip.file(fileName, buffer);
          totalFiles++;
        } catch (e) {
          errors.push(`${client.icode}/${strategy.strategyName} — ${String(e)}`);
        }
      }
    }

    if (totalFiles === 0) {
      return NextResponse.json(
        { error: "No Excel files could be generated", errors },
        { status: 500 }
      );
    }

    if (errors.length > 0) {
      masterZip.file("_errors.txt", errors.join("\n"));
    }

    const zipBuffer = await masterZip.generateAsync({ type: "nodebuffer" });
    const label     = icodeFilter ?? "all_clients";
    const date      = new Date().toISOString().slice(0, 10);

    return new Response(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="portfolio_excels_${label}_${date}.zip"`,
        "X-Files-Generated": String(totalFiles),
      },
    });
  } catch (err) {
    console.error("Admin download-all-excels error:", err);
    return NextResponse.json({ error: "Failed to generate portfolio Excels" }, { status: 500 });
  }
}
