"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SarlaSatidham } from "@/components/dashboard/SarlaSatidham";
import { ManagedAccounts } from "@/components/dashboard/ManagedAccounts";
import { PropAccounts } from "@/components/dashboard/PropAccounts";
import { Pms } from "@/components/dashboard/Pms";
import { dateFormatter, getGreeting } from "@/app/lib/dashboard-utils";
import type {
  Stats,
  PmsStats,
  Account,
  Metadata,
  SarlaApiResponse,
} from "@/app/lib/dashboard-types";

export default function Portfolio() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountCode = searchParams.get("accountCode") || "AC5";

  // User type detection
  const isSarla = session?.user?.icode === "QUS0007";
  const isSatidham = session?.user?.icode === "QUS0010";

  // State - Fixed type definition
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [viewMode] = useState<"consolidated" | "individual">("consolidated");
  const [stats, setStats] = useState<
    Stats | 
    PmsStats | 
    { stats: Stats | PmsStats; metadata: Account & { strategyName: string; isActive: boolean } }[] | 
    null
  >(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sarlaData, setSarlaData] = useState<SarlaApiResponse | null>(null);

  // Authentication check
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
  }, [status, router]);

  // Fetch data based on user type
  useEffect(() => {
    if (status !== "authenticated") return;

    const fetchSarlaLike = async (qcode: string) => {
      try {
        const res = await fetch(`/api/sarla-api?qcode=${qcode}&accountCode=${accountCode}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || `Failed to load data for accountCode ${accountCode}`);
        }
        const data: SarlaApiResponse = await res.json();
        setSarlaData(data);
      } catch (err: any) {
        setError(err?.message || `An unexpected error occurred for accountCode ${accountCode}`);
      } finally {
        setIsLoading(false);
      }
    };

    const fetchAccounts = async () => {
      try {
        const res = await fetch("/api/accounts", { credentials: "include" });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || "Failed to load accounts");
        }
        const data: Account[] = await res.json();
        setAccounts(data);
        if (data.length > 0) setSelectedAccount(data[0].qcode);
      } catch (err: any) {
        setError(err?.message || "An unexpected error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    if (isSarla) fetchSarlaLike("QAC00041");
    else if (isSatidham) fetchSarlaLike("QAC00046");
    else fetchAccounts();
  }, [status, router, isSarla, isSatidham, accountCode]);

  // Fetch account data for selected account (only for non-prop accounts)
  useEffect(() => {
    if (!selectedAccount || status !== "authenticated" || isSarla || isSatidham) return;

    const account = accounts.find((acc) => acc.qcode === selectedAccount);
    
    // Skip data fetching for prop accounts (PropAccounts component handles its own data)
    if (account?.account_type === "prop") {
      setStats(null);
      setMetadata(null);
      setIsLoading(false);
      return;
    }

    const fetchAccountData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const a = accounts.find((acc) => acc.qcode === selectedAccount);
        if (!a) throw new Error("Selected account not found");

        let endpoint = "";
        if (a.account_type === "pms") {
          endpoint = `/api/pms-data?qcode=${selectedAccount}&viewMode=${viewMode}&accountCode=${accountCode}`;
        } else {
          endpoint = `/api/portfolio?viewMode=${viewMode}${
            selectedAccount !== "all" ? `&qcode=${selectedAccount}` : ""
          }&accountCode=${accountCode}`;
        }

        const res = await fetch(endpoint, { credentials: "include" });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(
            e.error || `Failed to load data for account ${selectedAccount} with accountCode ${accountCode}`
          );
        }
        const response = await res.json();

        let statsData: Stats | PmsStats | Array<any>;
        let metadataData: Metadata | null = null;

        if ("data" in response && response.data !== undefined) {
          if (viewMode === "individual" && Array.isArray(response.data)) {
            statsData = response.data;
            metadataData = null;
          } else {
            statsData = response.data as Stats | PmsStats;
            metadataData = response.metadata || null;
          }
        } else {
          if (a.account_type === "pms") {
            const pmsData = response as any;
            if (pmsData.cashInOut && !pmsData.cashFlows) {
              pmsData.cashFlows = Array.isArray(pmsData.cashInOut.transactions)
                ? pmsData.cashInOut.transactions.map((tx: any) => ({
                    date: tx.date,
                    amount: parseFloat(tx.amount),
                  }))
                : [];
            }
            if (!pmsData.cashFlows) pmsData.cashFlows = [];
            statsData = pmsData as PmsStats;
            metadataData = {
              icode: selectedAccount,
              accountCount: 1,
              inceptionDate: null,
              dataAsOfDate: null,
              lastUpdated: new Date().toISOString(),
              strategyName: a.account_name || "PMS Portfolio",
              filtersApplied: {
                accountType: a.account_type,
                broker: a.broker,
                startDate: null,
                endDate: null,
              },
              isActive: true,
            };
            if (pmsData.equityCurve?.length) {
              const sorted = [...pmsData.equityCurve].sort(
                (x: any, y: any) => +new Date(x.date) - +new Date(y.date)
              );
              metadataData.inceptionDate = sorted[0].date;
              metadataData.dataAsOfDate = sorted[sorted.length - 1].date;
            }
          } else {
            if (viewMode === "individual" && Array.isArray(response)) {
              statsData = response;
              metadataData = null;
            } else {
              statsData = response as Stats;
              metadataData = {
                icode: selectedAccount,
                accountCount: 1,
                inceptionDate: null,
                dataAsOfDate: null,
                lastUpdated: new Date().toISOString(),
                strategyName: a.account_name || "Portfolio",
                filtersApplied: {
                  accountType: a.account_type,
                  broker: a.broker,
                  startDate: null,
                  endDate: null,
                },
                isActive: true,
              };
            }
          }
        }

        if (!statsData) throw new Error("No valid data received from API");
        setStats(statsData);
        setMetadata(metadataData);
      } catch (err: any) {
        setError(err?.message || `An unexpected error occurred for accountCode ${accountCode}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccountData();
  }, [selectedAccount, accounts, status, viewMode, isSarla, isSatidham, accountCode]);

  // Loading and error states
  if (status === "loading" || isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (error || !session?.user) {
    return (
      <div className="p-6 text-center bg-red-100 rounded-lg text-red-600 dark:bg-red-900/10 dark:text-red-400">
        {error || "Failed to load user data"}
      </div>
    );
  }

  // Get current account
  const currentAccount = accounts.find((acc) => acc.qcode === selectedAccount);

  // Get current metadata for header
  const currentMetadata =
    (isSarla || isSatidham) && sarlaData
      ? Object.values(sarlaData)[0]?.metadata
      : metadata;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-card-text-secondary font-heading">
            {getGreeting()}, {session?.user?.name || "User"}
          </h1>
          {currentMetadata && currentAccount?.account_type !== "prop" && (
            <div className="flex flex-wrap items-center gap-2 text-sm mt-2 text-card-text-secondary font-heading-bold">
              <span>
                Inception Date:{" "}
                <strong>
                  {currentMetadata.inceptionDate
                    ? dateFormatter(currentMetadata.inceptionDate)
                    : "N/A"}
                </strong>
              </span>
              <span>|</span>
              <span>
                Data as of:{" "}
                <strong>
                  {currentMetadata.dataAsOfDate
                    ? dateFormatter(currentMetadata.dataAsOfDate)
                    : "N/A"}
                </strong>
              </span>
            </div>
          )}
        </div>

        {/* Account Selector for non-Sarla/Satidham users */}
        {!isSarla && !isSatidham && accounts.length > 0 && (
          <div className="w-full sm:w-auto">
            <Select value={selectedAccount || ""} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-full sm:w-[300px] border-0 card-shadow text-button-text">
                <SelectValue placeholder="Select Account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.qcode} value={account.qcode}>
                    {account.account_name} ({account.account_type.toUpperCase()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Main Content - Render appropriate component based on user type */}
      {isSarla || isSatidham ? (
        // Sarla/Satidham User View
        sarlaData ? (
          <SarlaSatidham
            sarlaData={sarlaData}
            isSarla={isSarla}
            sessionUserName={session?.user?.name || "User"}
          />
        ) : (
          <div className="p-6 text-center bg-gray-100 rounded-lg text-gray-900">
            No strategy data found for {isSarla ? "Sarla" : "Satidham"} user.
          </div>
        )
      ) : (
        // Regular User View
        <>
          {!selectedAccount ? (
            <div className="p-6 text-center bg-gray-100 rounded-lg text-gray-900">
              No accounts found for this user.
            </div>
          ) : currentAccount?.account_type === "pms" ? (
            // PMS Account View
            stats && !Array.isArray(stats) ? (
              <Pms
                account={currentAccount}
                stats={stats}
                metadata={metadata}
                sessionUserName={session?.user?.name || "User"}
              />
            ) : (
              <div className="p-6 text-center bg-gray-100 rounded-lg text-gray-900">
                Loading PMS data...
              </div>
            )
          ) : currentAccount?.account_type === "prop" ? (
            // Prop Account View
            <PropAccounts
              account={currentAccount}
              sessionUserName={session?.user?.name || "User"}
            />
          ) : (
            // Managed Accounts (Futures) View
            <ManagedAccounts
              accounts={accounts}
              selectedAccount={selectedAccount}
              onAccountChange={setSelectedAccount}
              stats={stats}
              metadata={metadata}
              viewMode={viewMode}
              sessionUserName={session?.user?.name || "User"}
            />
          )}
        </>
      )}
    </div>
  );
}