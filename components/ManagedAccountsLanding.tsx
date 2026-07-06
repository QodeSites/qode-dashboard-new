"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, CreditCard, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

interface AppCardConfig {
  title: string;
  description: string;
  icon: React.ElementType;
  href: string | null;
  status: "live" | "coming-soon";
}

const apps: AppCardConfig[] = [
  {
    title: "MA Portfolio Review",
    description:
      "NAV performance, risk ratios, drawdown analysis, and exportable reports across all managed accounts.",
    icon: BarChart3,
    href: "/previewma",
    status: "live",
  },
  {
    title: "Cash & Margin",
    description:
      "Excess cash analysis, allocation management, margin utilisation, and stock transfer calculators.",
    icon: CreditCard,
    href: null,
    status: "coming-soon",
  },
];

function AppCard({ app }: { app: AppCardConfig }) {
  const Icon = app.icon;
  const isLive = app.status === "live";

  const cardBody = (
    <div className="rounded-2xl border border-yellow-600/30 border-t-4 border-t-button-text bg-white p-6 sm:p-7 flex flex-col h-full transition-shadow hover:shadow-md">
      <div className="h-11 w-11 rounded-lg bg-primary-bg flex items-center justify-center mb-5">
        <Icon className="h-5 w-5 text-logo-green" strokeWidth={2} />
      </div>

      <h3 className="font-serif text-xl text-logo-green mb-2">{app.title}</h3>

      <p className="text-sm text-card-text-secondary leading-relaxed flex-1">
        {app.description}
      </p>

      <div className="flex items-center justify-between mt-6">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium tracking-wide ${isLive
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-500"
            }`}
        >
          {isLive ? "LIVE" : "COMING SOON"}
        </span>

        {isLive && (
          <span className="h-9 w-9 rounded-full border border-logo-green/20 flex items-center justify-center text-logo-green">
            <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </div>
  );

  const footer = (
    <div
      className={`rounded-b-2xl -mt-2 px-6 py-4 text-center text-sm font-medium ${isLive
          ? "bg-logo-green text-button-text"
          : "bg-gray-200 text-gray-500"
        }`}
    >
      {isLive ? (
        <span className="inline-flex items-center gap-2">
          Open {app.title} <ArrowRight className="h-4 w-4" />
        </span>
      ) : (
        "Coming soon"
      )}
    </div>
  );

  if (isLive && app.href) {
    return (
      <Link href={app.href} className="flex flex-col group">
        {cardBody}
        {footer}
      </Link>
    );
  }

  return (
    <div className="flex flex-col opacity-90 cursor-not-allowed">
      {cardBody}
      {footer}
    </div>
  );
}

export function ManagedAccountsLanding() {
  return (
          
    <div className="min-h-screen bg-primary-bg px-4 sm:px-6 py-16 sm:py-20">
      {/* Logout — fixed top right */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={async () => {
            await signOut({ redirect: false });
            window.location.href = "/";
          }}
          className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 shadow-sm"
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </button>
      </div>

      <div className="max-w-5xl mx-auto">
        {/* Eyebrow */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <span className="h-px w-10 bg-card-text-secondary/30" />
          <span className="text-xs font-medium tracking-widest text-card-text-secondary uppercase">
            Managed Accounts
          </span>
          <span className="h-px w-10 bg-card-text-secondary/30" />
        </div>
        {/* Logo */}

        <h1 className="font-serif text-5xl sm:text-6xl text-center text-logo-green mb-6">
          Qode
        </h1>

        {/* Title */}
        <h2 className="text-3xl sm:text-5xl font-bold text-center text-logo-green mb-6">
          Department Dashboard
        </h2>

        {/* Subtitle */}
        <p className="text-center text-card-text-secondary max-w-md mx-auto mb-14">
          Portfolio analytics, cash management, and reporting tools for the MA
          team.
        </p>

        {/* Applications divider */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <span className="h-px flex-1 bg-card-text-secondary/20" />
          <span className="text-xs font-medium tracking-widest text-card-text-secondary uppercase">
            Applications
          </span>
          <span className="h-px flex-1 bg-card-text-secondary/20" />
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
          {apps.map((app) => (
            <AppCard key={app.title} app={app} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default ManagedAccountsLanding;