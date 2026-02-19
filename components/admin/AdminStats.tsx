"use client";

import { Card, CardContent } from "@/components/ui/card";
import { UsersIcon, BriefcaseIcon } from "@heroicons/react/24/outline";

interface AdminStatsProps {
  totalClients: number;
  totalAccounts: number;
  isLoading: boolean;
}

export function AdminStats({ totalClients, totalAccounts, isLoading }: AdminStatsProps) {
  const stats = [
    {
      label: "Total Clients",
      value: totalClients,
      icon: UsersIcon,
    },
    {
      label: "Total Accounts",
      value: totalAccounts,
      icon: BriefcaseIcon,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="bg-white/50 border border-card-text-secondary/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <stat.icon className="h-8 w-8 text-logo-green" />
              <div>
                {isLoading ? (
                  <div className="h-8 w-16 bg-card-text-secondary/10 rounded animate-pulse" />
                ) : (
                  <p className="text-3xl font-bold text-card-text">{stat.value}</p>
                )}
                <p className="text-sm text-card-text-secondary">{stat.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
