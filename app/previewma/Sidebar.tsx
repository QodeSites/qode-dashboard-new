"use client";

import Link from "next/link";
import { ArrowLeft, Users, TriangleAlert, ArrowRightLeft, ArrowLeftRight } from "lucide-react";
import { getAlertSummary } from "./alert";



type ActivePage = "p1" | "p2"| "p4"|"p5"|"p6";

export function Sidebar({ active }: { active: ActivePage }) {
  const { totalOpen } = getAlertSummary();

  const navItems: {
    key: ActivePage;
    href: string;
    label: string;
    icon: React.ReactNode;
  }[] = [
    { key: "p1", href: "/cash-margin", label: "Dashboard", icon: <Users className="h-4 w-4" /> },
    { key: "p4", href: "/alerts", label: "Alerts", icon: <TriangleAlert className="h-4 w-4" /> },
     { key: "p5", href: "/deployment", label: "Deployment", icon: <ArrowRightLeft className="h-4 w-4" /> },
    { key: "p6", href: "/withdrawal", label: "Withdrawal", icon: <ArrowLeftRight className="h-4 w-4" /> },
  
  ];

  return (
    <aside className="w-64 flex-shrink-0 bg-logo-green min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="text-white font-serif text-lg font-bold">Cash & Margin</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4">
        {navItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`flex items-center justify-between gap-3 mt-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active === item.key
                ? "bg-white/15 text-white"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span className="flex items-center gap-3">
              {item.icon}
              {item.label}
            </span>
            {item.key === "p4" && totalOpen > 0 && (
              <span
                className={`flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold ${
                  active !== "p4" ? "animate-pulse" : ""
                }`}
              >
                {totalOpen}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* Back link */}
      <div className="px-4 py-4 border-t border-white/10">
        <Link href="/" className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </div>
    </aside>
  );
}