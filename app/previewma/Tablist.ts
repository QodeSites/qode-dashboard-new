

export const TOP_TABS = [
  { key: "portfolio-summary", label: "Portfolio Summary", icon: "pin" },
  { key: "client-wise", label: "Client Wise Return", icon: "briefcase" },
  { key: "strategy-monthly", label: "Strategy-wise Monthly Returns", icon: "trending" },
  { key: "sub-strategy", label: "Sub-Strategy Performance", icon: "bar-chart" },
  { key: "client-dashboards", label: "Client Dashboards", icon: "user" },
  
  { key: "comparison", label: "Analysis", icon: "trending", },
  { key: "account-value", label: "Account Value Breakup", icon: "briefcase" },
  // { key: "strategy-breakup", label: "Strategy-wise Client Breakup", icon: "file" },
] as const;

export type TopTabKey = (typeof TOP_TABS)[number]["key"];