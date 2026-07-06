"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  Upload,
  ChevronDown,
  User,
  Pin,
  FileText,
  Briefcase,
  BarChart3,
  TrendingUp,
  Download,
  Settings2,
  X,
} from "lucide-react";
import { UnderlineTabs } from "./UnderlineTabs";

import { PortfolioSummary } from "./PortfolioSummary";
import { TOP_TABS, TopTabKey } from "./mockData";
import { classifyTags, ClientDashboardsTab } from "./ClientDashboardtab";
import { MultiSelectDropdown } from "./MultiselectDropdown";
import StrategyBreakup from "./Strategybreakup";
import AccountValueBreakup from "./Accountvaluebreakup";
import SubStrategyPerformance from "./Substrategyperformance";
import StrategyMonthlyReturns from "./Strategymonthlyreturn";


const TOP_TAB_ICONS: Record<string, React.ReactNode> = {
  user: <User className="h-3.5 w-3.5" />,
  pin: <Pin className="h-3.5 w-3.5" />,
  file: <FileText className="h-3.5 w-3.5" />,
  briefcase: <Briefcase className="h-3.5 w-3.5" />,
  "bar-chart": <BarChart3 className="h-3.5 w-3.5" />,
  trending: <TrendingUp className="h-3.5 w-3.5" />,
};

function PlaceholderTab({ title }: { title: string }) {
  return (
    <div className="text-center py-16">
      <div className="text-4xl mb-3">🔧</div>
      <h3 className="font-serif text-xl text-logo-green mb-2">{title}</h3>
      <p className="text-sm text-card-text-secondary mb-3">
        This section is under development and will be available in a future release.
      </p>
      <span className="inline-block rounded-full bg-primary-bg px-4 py-1.5 text-xs font-bold text-logo-green">
        Coming Soon
      </span>
    </div>
  );
}

export function MaReviewDashboard() {
  const [topTab, setTopTab] = useState<TopTabKey>("client-dashboards");

  // Sidebar open/closed
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Settings panel collapsed state (inside sidebar)
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);

  const [returnTables, setReturnTables] = useState({ monthly: true, quarterly: true, yearly: true });
  const [riskFree, setRiskFree] = useState(6.5);

  // Incrementing this re-triggers fetches with the latest riskFree value.
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // Additional System Tags state
  const [tagMode, setTagMode] = useState<"Aggregate" | "Individual" | "Both">("Aggregate");
  const [selectedAggTags, setSelectedAggTags] = useState<string[]>([]);
  const [selectedIndTags, setSelectedIndTags] = useState<string[]>([]);
  const [knownTagNames, setKnownTagNames] = useState<string[]>([]);
  const { aggregate: aggregateTagOptions, individual: individualTagOptions } = classifyTags(knownTagNames);

  // Combined tag filter passed down to Overview/Analysis/Charts tabs.
  const selectedTagFilter = useMemo(
    () => Array.from(new Set([...selectedAggTags, ...selectedIndTags])),
    [selectedAggTags, selectedIndTags]
  );

  function handleTagFilterDefault(profitTag: string) {
    setSelectedAggTags([profitTag]);
    setSelectedIndTags([]);
  }

  const [clientCount, setClientCount] = useState<number | null>(null);

  const topTabsForBar = TOP_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    icon: TOP_TAB_ICONS[t.icon],
  }));

  return (
    <div className="min-h-screen bg-primary-bg">
      {/* ── Left drawer backdrop ─────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Left drawer ──────────────────────────────────────────────── */}
      <aside
        className={`fixed top-0 left-0 h-full w-80 z-40 bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-logo-green/10 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Settings2 className="h-4 w-4 text-logo-green" />
            <span className="font-semibold text-sm text-logo-green">Settings</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 text-card-text-secondary hover:bg-primary-bg hover:text-logo-green transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drawer body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Dashboard Settings panel */}
          <div className={`rounded-xl border border-logo-green/10 bg-primary-bg/40 ${settingsOpen ? "" : "overflow-hidden"}`}>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-card-text"
            >
              <span>⚙️ Dashboard Settings</span>
              <ChevronDown className={`h-4 w-4 text-card-text-secondary transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
            </button>
            {settingsOpen && (
              <div className="px-4 pb-4 pt-1 border-t border-logo-green/10 space-y-5">
                {/* Return Tables */}
                <div>
                  <div className="text-sm font-semibold text-card-text mt-3 mb-2.5">Return Tables</div>
                  <div className="flex flex-col gap-2">
                    {(["monthly", "quarterly", "yearly"] as const).map((key) => (
                      <label key={key} className="flex items-center gap-2 text-sm text-card-text cursor-pointer capitalize">
                        <input
                          type="checkbox"
                          checked={returnTables[key]}
                          onChange={(e) => setReturnTables((prev) => ({ ...prev, [key]: e.target.checked }))}
                          className="h-4 w-4 rounded border-logo-green/40 accent-logo-green"
                        />
                        {key}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Risk-free Rate */}
                <div>
                  <div className="text-sm font-semibold text-card-text mb-2.5">Risk-free Rate</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={riskFree}
                      onChange={(e) => setRiskFree(parseFloat(e.target.value) || 0)}
                      className="w-24 rounded-lg border border-logo-green/20 bg-white px-3 py-2 text-sm text-card-text"
                    />
                    <div className="flex flex-col gap-px">
                      <button
                        onClick={() => setRiskFree((r) => Math.round((r + 0.1) * 10) / 10)}
                        className="h-4 w-7 rounded-t bg-white border border-logo-green/20 text-xs text-card-text-secondary leading-none"
                      >
                        +
                      </button>
                      <button
                        onClick={() => setRiskFree((r) => Math.round((r - 0.1) * 10) / 10)}
                        className="h-4 w-7 rounded-b bg-white border border-logo-green/20 text-xs text-card-text-secondary leading-none"
                      >
                        −
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFetchTrigger((n) => n + 1)}
                      className="inline-flex items-center rounded-lg bg-logo-green px-3 py-2 text-xs font-medium text-button-text hover:bg-logo-green/90 transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Additional System Tags panel */}
          <div className={`rounded-xl border border-logo-green/10 bg-primary-bg/40 ${tagsOpen ? "" : "overflow-hidden"}`}>
            <button
              onClick={() => setTagsOpen(!tagsOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-card-text"
            >
              <span>🏷️ Additional System Tags</span>
              <ChevronDown className={`h-4 w-4 text-card-text-secondary transition-transform ${tagsOpen ? "rotate-180" : ""}`} />
            </button>
            {tagsOpen && (
              <div className="px-4 pb-4 pt-1 border-t border-logo-green/10">
                <p className="text-xs text-card-text-secondary mt-3 mb-4 leading-relaxed">
                  Each client&apos;s profit tag and sub-tags are pre-loaded. Add extra tags here to include them in all return tables.
                </p>

                <div className="mb-4">
                  <div className="text-sm font-semibold text-card-text mb-2.5">Tag mode</div>
                  <div className="flex flex-col gap-2">
                    {(["Aggregate", "Individual", "Both"] as const).map((mode) => (
                      <label key={mode} className="flex items-center gap-2.5 text-sm text-card-text cursor-pointer">
                        <span className={`h-4 w-4 rounded-full border-2 flex-shrink-0 ${tagMode === mode ? "border-red-500" : "border-card-text-secondary/40"}`}>
                          {tagMode === mode && <span className="block h-full w-full scale-50 rounded-full bg-red-500" />}
                        </span>
                        <input type="radio" name="tagMode" className="sr-only" checked={tagMode === mode} onChange={() => setTagMode(mode)} />
                        {mode}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  {knownTagNames.length === 0 && (
                    <p className="text-xs text-card-text-secondary italic">
                      Tag options appear once a client&apos;s dashboard has loaded.
                    </p>
                  )}
                  {(tagMode === "Aggregate" || tagMode === "Both") && (
                    <MultiSelectDropdown
                      label="Extra aggregate tags"
                      options={aggregateTagOptions}
                      selected={selectedAggTags}
                      onChange={setSelectedAggTags}
                    />
                  )}
                  {(tagMode === "Individual" || tagMode === "Both") && (
                    <MultiSelectDropdown
                      label="Extra individual tags"
                      options={individualTagOptions}
                      selected={selectedIndTags}
                      onChange={setSelectedIndTags}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="px-4 sm:px-8 py-8">
        <div className="max-w-7xl mx-auto">

          {/* Back button */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-logo-green px-4 py-2 text-sm font-medium text-button-text hover:bg-logo-green/90 transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>

          {/* Header */}
          <div className="pb-4 mb-6 border-b border-logo-green/10">
            <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-button-text mb-1">
              Qode Advisors
            </p>
            <h1 className="font-serif text-3xl text-logo-green mb-1.5">MA Review Dashboard</h1>
            <p className="text-sm text-card-text-secondary">Portfolio Analysis &amp; Reporting</p>
          </div>

          {/* Data bar + Settings toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <p className="text-xs text-card-text-secondary">
              🚀 Data: <strong className="text-card-text">2026/06/19</strong> &middot; not yet computed
            </p>
            <div className="flex items-center gap-3">
              {/* Settings toggle button */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-lg border border-logo-green/20 bg-white px-4 py-2 text-sm font-medium text-card-text hover:bg-primary-bg/40 transition-colors flex items-center gap-2"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Settings
              </button>
              <button className="rounded-lg border border-logo-green/20 bg-white px-5 py-2 text-sm font-medium text-card-text hover:bg-primary-bg/40 transition-colors flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
              {/* <button className="rounded-lg bg-logo-green px-5 py-2 text-sm font-medium text-button-text hover:bg-logo-green/90 transition-colors flex items-center gap-2">
                <Upload className="h-3.5 w-3.5" />
                Upload
              </button> */}
            </div>
          </div>

          {/* Client count pill */}
          {clientCount !== null && (
            <span className="inline-block rounded-md bg-[#e8f0ed] px-3 py-1 text-xs font-semibold text-logo-green mb-4">
              {clientCount} clients
            </span>
          )}

          {/* Top-level tabs */}
          <UnderlineTabs tabs={topTabsForBar} active={topTab} onChange={(k) => setTopTab(k as TopTabKey)} />

          <div className="pt-6">
            {topTab === "client-dashboards" && (
              <ClientDashboardsTab
                riskFreeRate={riskFree / 100}
                onTagsLoaded={(names) =>
                  setKnownTagNames((prev) => Array.from(new Set([...prev, ...names])))
                }
                onClientsLoaded={setClientCount}
                fetchTrigger={fetchTrigger}
                selectedTagFilter={selectedTagFilter}
                onTagFilterDefault={handleTagFilterDefault}
              />
            )}
            {topTab === "portfolio-summary" && <PortfolioSummary />}
            {topTab === "strategy-breakup" && <StrategyBreakup riskFreeRate={riskFree / 100} fetchTrigger={fetchTrigger} />}
            {topTab === "account-value" && <AccountValueBreakup />}
            {topTab === "sub-strategy" && <SubStrategyPerformance />}
            {topTab === "strategy-monthly" && <StrategyMonthlyReturns />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MaReviewDashboard;