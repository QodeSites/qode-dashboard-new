"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  UsersIcon,
  BriefcaseIcon,
  ChartBarIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface AccountAum {
  name: string;
  aum: number;
}

interface AdminStatsProps {
  totalClients: number;
  totalAccounts: number;
  totalAumManaged: number;
  accountAums: AccountAum[];
  isLoading: boolean;
}

function formatInr(value: number): string {
  const num = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `₹ ${num}`;
}

export function AdminStats({
  totalClients,
  totalAccounts,
  totalAumManaged,
  accountAums,
  isLoading,
}: AdminStatsProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Clients */}
        <Card className="bg-white/50 border border-card-text-secondary/20">
          <CardContent className="p-6 flex items-center gap-4">
            <UsersIcon className="h-8 w-8 text-logo-green" />
            <div>
              {isLoading ? (
                <div className="h-8 w-16 bg-card-text-secondary/10 rounded animate-pulse" />
              ) : (
                <p className="text-3xl font-bold text-card-text">
                  {totalClients.toLocaleString("en-IN")}
                </p>
              )}
              <p className="text-sm text-card-text-secondary">Total Clients</p>
            </div>
          </CardContent>
        </Card>

        {/* Accounts */}
        <Card className="bg-white/50 border border-card-text-secondary/20">
          <CardContent className="p-6 flex items-center gap-4">
            <BriefcaseIcon className="h-8 w-8 text-logo-green" />
            <div>
              {isLoading ? (
                <div className="h-8 w-16 bg-card-text-secondary/10 rounded animate-pulse" />
              ) : (
                <p className="text-3xl font-bold text-card-text">
                  {totalAccounts.toLocaleString("en-IN")}
                </p>
              )}
              <p className="text-sm text-card-text-secondary">Total Accounts</p>
            </div>
          </CardContent>
        </Card>

        {/* AUM */}
        <Card
          onClick={() => setOpen(true)}
          className="bg-white/50 border border-card-text-secondary/20 cursor-pointer hover:shadow-md transition"
        >
          <CardContent className="p-6 flex items-center gap-4">
            <ChartBarIcon className="h-8 w-8 text-logo-green" />
            <div>
              {isLoading ? (
                <div className="h-8 w-24 bg-card-text-secondary/10 rounded animate-pulse" />
              ) : (
                <p className="text-3xl font-bold text-card-text whitespace-nowrap">
                  {formatInr(totalAumManaged)}
                </p>
              )}
              <p className="text-sm text-card-text-secondary">
                Total AUM (Managed Account)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          
          {/* Background overlay */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />

          {/* Modal box */}
          <div className="relative bg-white rounded-2xl shadow-xl w-[500px] max-h-[70vh] p-6 z-10 flex flex-col">
            
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">AUM Breakdown - <span>{accountAums.length}</span> Accounts</h2> 
              <button onClick={() => setOpen(false)}>
                <XMarkIcon className="h-5 w-5 text-gray-500 hover:text-black" />
              </button>
            </div>

            {/* Content (scrollable) */}
            <div className="overflow-y-auto space-y-2 pr-2">
              {accountAums
                .sort((a, b) => b.aum - a.aum)
                .map((acc) => (
                  <div
                    key={acc.name}
                    className="flex justify-between border-b pb-2 text-sm"
                  >
                    <span>{acc.name}</span>
                    <span className="font-medium">
                      {formatInr(acc.aum)}
                    </span>
                  </div>
                ))}
            </div>

          </div>
        </div>
      )}
    </>
  );
}
