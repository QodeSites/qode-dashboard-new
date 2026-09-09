"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Pin,
  FileText,
  Briefcase,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import { UnderlineTabs } from "./UnderlineTabs";

import { PortfolioSummary } from "./PortfolioSummary";
import { TOP_TABS, TopTabKey } from "./mockData";
import { ClientDashboardsTab } from "./ClientDashboardtab";
import StrategyBreakup from "./Strategybreakup";
import AccountValueBreakup from "./Accountvaluebreakup";
import SubStrategyPerformance from "./Substrategyperformance";
import StrategyMonthlyReturns from "./Strategymonthlyreturn";
import ComparisonTab from "./ComparisonTab";

const DEFAULT_RISK_FREE_RATE = 0.065;

const TOP_TAB_ICONS: Record<string, React.ReactNode> = {
  user: <User className="h-3.5 w-3.5" />,
  pin: <Pin className="h-3.5 w-3.5" />,
  file: <FileText className="h-3.5 w-3.5" />,
  briefcase: <Briefcase className="h-3.5 w-3.5" />,
  "bar-chart": <BarChart3 className="h-3.5 w-3.5" />,
  trending: <TrendingUp className="h-3.5 w-3.5" />,
};

export function MaReviewDashboard() {
  const [topTab, setTopTab] = useState<TopTabKey>("portfolio-summary");

  // Single combined tag list — no more Aggregate/Individual/Both mode split.
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [knownTagNames, setKnownTagNames] = useState<string[]>([]);

  function handleTagFilterDefault(profitTag: string) {
    setSelectedTags([profitTag]);
  }

  const [clientCount, setClientCount] = useState<number | null>(null);

  const topTabsForBar = TOP_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    icon: TOP_TAB_ICONS[t.icon],
  }));

  return (
    <div className="min-h-screen bg-primary-bg">
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
                riskFreeRate={DEFAULT_RISK_FREE_RATE}
                onTagsLoaded={(names) =>
                  setKnownTagNames((prev) => Array.from(new Set([...prev, ...names])))
                }
                onClientsLoaded={setClientCount}
                selectedTagFilter={selectedTags}
                onTagFilterDefault={handleTagFilterDefault}
                tagOptions={knownTagNames}
                onTagsChange={setSelectedTags}
              />
            )}
            {topTab === "comparison" && <ComparisonTab />}
            {topTab === "portfolio-summary" && <PortfolioSummary />}
            {topTab === "strategy-breakup" && <StrategyBreakup riskFreeRate={DEFAULT_RISK_FREE_RATE} fetchTrigger={0} />}
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