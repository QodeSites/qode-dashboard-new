import JSZip from "jszip";
import { PortfolioApi } from "@/app/lib/sarla-utils";
import { getEngineForQcode } from "@/app/lib/bifurcated-portfolio-utils";
import { findByIcode } from "@/app/lib/bifurcated-clients-registry";
import { getUserQcodes, calculatePortfolioMetrics, formatPortfolioStats } from "@/app/lib/portfolio-utils";
import { generateExcelBufferServer, fetchBenchmarkForDateRange, ServerExcelInput } from "@/components/generateExcelReportServer";

// ============================================================================
// Types
// ============================================================================

export interface PortfolioEntry {
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

export interface ExcelExportAccount {
  qcode: string;
  account_name: string;
  account_type: string;
  broker: string;
}

export interface ExcelExportClient {
  icode: string;
  user_name: string | null;
  accounts: ExcelExportAccount[];
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
export async function fetchStrategies(
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

/**
 * Builds a ZIP buffer containing one .xlsx per strategy per client, for the
 * given list of clients. Shared by the admin and partner "download all
 * Excels" routes — the only difference between them is which clients are
 * passed in.
 */
export async function buildExcelZipForClients(
  clients: ExcelExportClient[]
): Promise<{ zipBuffer: Buffer; totalFiles: number; errors: string[] }> {
  const masterZip  = new JSZip();
  let   totalFiles = 0;
  const errors: string[] = [];

  for (const client of clients) {
    let strategies: PortfolioEntry[] = [];
    try {
      strategies = await fetchStrategies(client.icode, client.accounts);
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

  if (errors.length > 0) {
    masterZip.file("_errors.txt", errors.join("\n"));
  }

  const zipBuffer = await masterZip.generateAsync({ type: "nodebuffer" });
  return { zipBuffer, totalFiles, errors };
}
