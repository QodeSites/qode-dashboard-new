"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRightOnRectangleIcon, UserCircleIcon } from "@heroicons/react/24/outline";

export function AdminHeader() {
  const { data: session } = useSession();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut({ redirect: false });
    window.location.href = "/";
  };

  const adminName = session?.user?.name || "Admin";
  const adminEmail = session?.user?.email || "";

  return (
    <div className="flex items-center justify-between py-4 mb-2">
      <div className="flex items-center gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-heading font-bold text-logo-green">
              Client Management Dashboard
            </h1>
            <Badge className="bg-logo-green/10 text-logo-green border-logo-green/30">
              Admin Access
            </Badge>
          </div>
          <p className="text-sm text-card-text-secondary mt-1">
            Monitor clients, manage multiple accounts, and view dashboards
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <UserCircleIcon className="h-5 w-5 text-card-text-secondary" />
          <div className="text-right">
            <p className="text-sm font-medium text-card-text">{adminName}</p>
            <p className="text-xs text-card-text-secondary">{adminEmail}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="gap-2 text-card-text-secondary hover:text-logo-green"
        >
          <ArrowRightOnRectangleIcon className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );
}
