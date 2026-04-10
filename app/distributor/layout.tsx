"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { DistributorSidebar } from "@/components/distributor/DistributorSidebar";
import { Bars3Icon, ArrowRightOnRectangleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";

interface DistributorLayoutProps {
  children: React.ReactNode;
}

export default function DistributorLayout({ children }: DistributorLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-primary-bg">
      <DistributorSidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      <div className="lg:pl-64">
        {/* Header: hamburger (mobile) + logout (all sizes) */}
        <div className="flex items-center justify-between px-4 py-2">
          <button
            type="button"
            className="-m-2.5 p-4 text-card-text-secondary lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="gap-2 text-card-text-secondary hover:text-logo-green"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5" />
              <span className="text-sm">Logout</span>
            </Button>
          </div>
        </div>
        <main className="p-6 pt-0">
          <div className="max-w-8xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
