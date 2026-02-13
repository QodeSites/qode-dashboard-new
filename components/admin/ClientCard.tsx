"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EyeIcon } from "@heroicons/react/24/outline";

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
}

export function ClientCard({
  icode,
  name,
  email,
  accounts,
  accountCount,
  onImpersonate,
}: ClientCardProps) {
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

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="text-center p-2 bg-primary-bg rounded-lg">
            <p className="text-lg font-bold text-card-text">{accountCount}</p>
            <p className="text-xs text-card-text-secondary">Accounts</p>
          </div>
          <div className="text-center p-2 bg-primary-bg rounded-lg">
            <p className="text-lg font-bold text-card-text">
              {[...new Set(accounts.map((a) => a.broker))].length}
            </p>
            <p className="text-xs text-card-text-secondary">Brokers</p>
          </div>
        </div>

        {accounts.length > 0 && (
          <div className="mb-4 space-y-1">
            {accounts.slice(0, 3).map((account) => (
              <div
                key={account.qcode}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-card-text-secondary truncate">
                  {account.qcode}
                </span>
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0"
                >
                  {account.broker}
                </Badge>
              </div>
            ))}
            {accounts.length > 3 && (
              <p className="text-xs text-card-text-secondary">
                +{accounts.length - 3} more
              </p>
            )}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 text-logo-green border-logo-green/30 hover:bg-logo-green/5"
          onClick={() => onImpersonate(icode)}
        >
          <EyeIcon className="h-4 w-4" />
          View Dashboard
        </Button>
      </CardContent>
    </Card>
  );
}
