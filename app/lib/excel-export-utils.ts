import JSZip from "jszip";
import { PortfolioApi, SARLA_TOTAL_FEES } from "@/app/lib/sarla-utils";
import { getEngineForQcode } from "@/app/lib/bifurcated-portfolio-utils";
import { findByIcode } from "@/app/lib/bifurcated-clients-registry";
import { getUserQcodes, calculatePortfolioMetrics, formatPortfolioStats } from "@/app/lib/portfolio-utils";
import { generateExcelBufferServer, fetchBenchmarkForDateRange, ServerExcelInput } from "@/components/generateExcelReportServer";
import { fetchHoldingsForClient, generateHoldingsExcelBuffer } from "@/app/lib/holdings-export-utils";

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
  hasNavBasedTotalPortfolio?: boolean;
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
function toExcelInput(entry: PortfolioEntry, clientName: string, icode: string): ServerExcelInput {
  const { data, metadata, accountInfo } = entry;
  const isTotalPortfolio = entry.strategyName === "Total Portfolio";
  // Sarla's Total Portfolio is the only strategy with a Gross/Net fee breakdown today
  // (see SARLA_TOTAL_FEES in sarla-utils.ts, mirrored client-side in app/dashboard/page.tsx).
  const fees = icode === "QUS0007" && isTotalPortfolio ? SARLA_TOTAL_FEES : undefined;
  return {
    strategyName: entry.strategyName,
    isTotalPortfolio,
    hasNavBasedTotalPortfolio: entry.hasNavBasedTotalPortfolio ?? false,
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
    fees,
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
    // PMS-blended clients (e.g. Ashok) render Total Portfolio Sarla/Satidham-style
    // (absolute ₹ only, no NAV curve) even if hasNavBasedTotalPortfolio is set —
    // mirrors the `pmsBlendedTP` check in app/dashboard/page.tsx.
    const pmsBlendedTP = (bifurcated.config?.pmsSchemes?.length ?? 0) > 0;
    const navBased = bifurcated.hasNavBasedTotalPortfolio && !pmsBlendedTP;
    return Object.entries(data).map(([strategyName, portRes]: [string, any]) => ({
      strategyName,
      data:     portRes.data     ?? {},
      metadata: portRes.metadata ?? {},
      hasNavBasedTotalPortfolio: strategyName === "Total Portfolio" ? navBased : false,
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

// Process at most N clients in parallel. Higher = faster but risks Prisma pool
// exhaustion and DB drops (P1001). 3 is a safe default for our pool size.
const CLIENT_CONCURRENCY = 3;

// Retry a Prisma-touching operation once on transient connection errors (P1001,
// P1002, P2024). One retry is enough to survive brief network blips without
// masking real failures.
async function withDbRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P1001" || code === "P1002" || code === "P2024") {
      console.warn(`[excel-export] ${label} hit ${code}, retrying once`);
      await new Promise((r) => setTimeout(r, 500));
      return await fn();
    }
    throw e;
  }
}

/** Run `worker` over `items` with a fixed concurrency pool. */
async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

// ============================================================================
// Dashboard-only builder
// ============================================================================

async function writeDashboardForClient(
  client: ExcelExportClient,
  folder: JSZip,
  errors: string[]
): Promise<number> {
  const clientName = (client.user_name ?? client.icode).replace(/[/\\?%*:|"<>]/g, "_");
  let produced = 0;

  let strategies: PortfolioEntry[] = [];
  try {
    strategies = await withDbRetry(`fetchStrategies(${client.icode})`, () =>
      fetchStrategies(client.icode, client.accounts)
    );
  } catch (e) {
    errors.push(`${client.icode} — failed to fetch strategies: ${String(e)}`);
  }

  for (const strategy of strategies) {
    try {
      const input = toExcelInput(strategy, client.user_name ?? client.icode, client.icode);

      const inceptionDate = strategy.metadata.inceptionDate ?? strategy.metadata.startDate;
      if (inceptionDate && strategy.metadata.dataAsOfDate) {
        try {
          input.benchmarkReturns = await fetchBenchmarkForDateRange(
            inceptionDate,
            strategy.metadata.dataAsOfDate
          );
        } catch {
          // benchmark columns will be blank
        }
      }

      const buffer = await generateExcelBufferServer(input);
      const fileName = strategies.length === 1
        ? `${clientName}.xlsx`
        : `${clientName} - ${strategy.strategyName.replace(/[/\\?%*:|"<>]/g, "_")}.xlsx`;
      folder.file(fileName, buffer);
      produced++;
    } catch (e) {
      errors.push(`${client.icode}/${strategy.strategyName} — ${String(e)}`);
    }
  }

  return produced;
}

export async function buildDashboardZipForClients(
  clients: ExcelExportClient[]
): Promise<{ zipBuffer: Buffer; totalFiles: number; errors: string[] }> {
  const zip = new JSZip();
  const folder = zip.folder("dashboard")!;
  const errors: string[] = [];
  let totalFiles = 0;

  await runPool(clients, CLIENT_CONCURRENCY, async (client) => {
    const produced = await writeDashboardForClient(client, folder, errors);
    totalFiles += produced;
  });

  if (errors.length > 0) zip.file("_errors.txt", errors.join("\n"));
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  return { zipBuffer, totalFiles, errors };
}

// ============================================================================
// Holdings-only builder
// ============================================================================

async function writeHoldingsForClient(
  client: ExcelExportClient,
  folder: JSZip,
  errors: string[]
): Promise<number> {
  const clientName = (client.user_name ?? client.icode).replace(/[/\\?%*:|"<>]/g, "_");
  let produced = 0;

  try {
    const holdingsEntries = await withDbRetry(`fetchHoldingsForClient(${client.icode})`, () =>
      fetchHoldingsForClient(client.icode, client.accounts)
    );
    for (const entry of holdingsEntries) {
      try {
        const buffer = generateHoldingsExcelBuffer(
          entry.holdingsSummary,
          client.user_name ?? client.icode,
          entry.dataAsOfDate
        );
        const label = entry.label.replace(/[/\\?%*:|"<>]/g, "_");
        const fileName = holdingsEntries.length === 1
          ? `${clientName}.xlsx`
          : `${clientName} - ${label}.xlsx`;
        folder.file(fileName, buffer);
        produced++;
      } catch (e) {
        errors.push(`${client.icode}/holdings/${entry.label} — ${String(e)}`);
      }
    }
  } catch (e) {
    errors.push(`${client.icode} — failed to fetch holdings: ${String(e)}`);
  }

  return produced;
}

export async function buildHoldingsZipForClients(
  clients: ExcelExportClient[]
): Promise<{ zipBuffer: Buffer; totalFiles: number; errors: string[] }> {
  const zip = new JSZip();
  const folder = zip.folder("holdings")!;
  const errors: string[] = [];
  let totalFiles = 0;

  await runPool(clients, CLIENT_CONCURRENCY, async (client) => {
    const produced = await writeHoldingsForClient(client, folder, errors);
    totalFiles += produced;
  });

  if (errors.length > 0) zip.file("_errors.txt", errors.join("\n"));
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  return { zipBuffer, totalFiles, errors };
}
