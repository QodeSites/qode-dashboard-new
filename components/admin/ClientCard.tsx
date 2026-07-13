"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EyeIcon } from "@heroicons/react/24/outline";
import { Download } from "lucide-react";
import { useState } from "react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

interface Account {
  qcode: string;
  account_name: string;
  account_type: string;
  broker: string;
}

interface ClientCardProps {
  icode: string;
  name: string;
  email: string;
  accounts: Account[];
  accountCount: number;
  onImpersonate: (icode: string) => void;
  isImpersonating?: boolean;
  dashboardVisible?: boolean;
  onToggleVisibility?: (icode: string, visible: boolean) => void;
  showVisibilityToggle?: boolean;
  showCsvExport?: boolean;
  showQcode?: boolean;
}

export function ClientCard({
  icode,
  name,
  email,
  accounts,
  accountCount,
  onImpersonate,
  isImpersonating,
  dashboardVisible = true,
  onToggleVisibility,
  showVisibilityToggle = true,
  showCsvExport = true,
  showQcode = true,
}: ClientCardProps) {
  const [exporting, setExporting] = useState(false);

  // Export handler functions
  const handleDownloadCsv = async (qcode: string[]) => {
    try {
      setExporting(true);

      const res = await fetch("/api/export-csv", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ qcodes: qcode }),
      });

      if (!res.ok) {
        throw new Error("Download failed");
      }

      const blob = await res.blob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${qcode}-data.csv`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card className="bg-white/50 border border-card-text-secondary/20 hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-card-text truncate">{name}</p>
            <p className="text-xs text-card-text-secondary truncate">{email}</p>
          </div>
          <Badge variant="outline" className="shrink-0 ml-2 text-xs">
            {icode}
          </Badge>
        </div>

        {showVisibilityToggle && (
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs text-card-text-secondary">Dashboard Access</span>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${dashboardVisible ? "text-logo-green" : "text-card-text-secondary"}`}>
                {dashboardVisible ? "On" : "Off"}
              </span>
              <Switch
                checked={dashboardVisible}
                onCheckedChange={(checked) => onToggleVisibility?.(icode, checked)}
                className="data-[state=checked]:bg-logo-green data-[state=unchecked]:bg-card-text-secondary/30"
              />
            </div>
          </div>
        )}

        <div className="mb-4">
          <div className="text-center p-2 bg-primary-bg rounded-lg">
            <p className="text-lg font-bold text-card-text">{accountCount}</p>
            <p className="text-xs text-card-text-secondary">Accounts</p>
          </div>
        </div>

        {accounts.length > 0 && showQcode && (
          <div className="flex justify-between">
            <div className="mb-4 space-y-1">
              {accounts.slice(0, 3).map((account) => (
                <div
                key={account.qcode}
                className="text-xs"
                >
                <div className="flex w-full justify-between">
                    <span className="text-card-text-secondary truncate">
                      {account.qcode}
                    </span>
                  </div>
                </div>
              ))}
              {accounts.length > 3 && (
                <p className="text-xs text-card-text-secondary">
                  +{accounts.length - 3} more
                </p>
              )}
            </div>
            {showCsvExport && (
              <span className="text-card-text-secondary truncate">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      disabled={exporting}
                      className="h-6 w-[90px] px-2 text-xs font-medium bg-logo-green text-button-text hover:bg-logo-green/90 flex items-center justify-center"
                    >
                      {exporting ? (
                        <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-1" />
                          CSV
                        </>
                      )}
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent className="w-30 bg-white border border-gray-200 shadow-md rounded-md">
                    {accounts.map((acc) => (
                      <DropdownMenuItem
                        className="text-sm font-bold cursor-pointer px-3 py-2 rounded-sm
                        hover:bg-logo-green/10 focus:bg-logo-green/10
                        hover:text-gray-700 focus:text-gray-700 text-gray-700"
                        key={acc.qcode}
                        onClick={() => handleDownloadCsv([acc.qcode])}
                      >
                        <Download className="h-2 w-2 mr-1" />{acc.qcode}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            )}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 text-logo-green border-logo-green/30 hover:bg-logo-green/5"
          onClick={() => onImpersonate(icode)}
          disabled={isImpersonating}
        >
          {isImpersonating ? (
            "Loading..."
          ) : (
            <>
              <EyeIcon className="h-4 w-4" />
              View Dashboard
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
