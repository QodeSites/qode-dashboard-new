"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import Header from "@/components/header";
import { usePageVisibilityGate } from "@/hooks/usePageVisibilityGate";
import type { PageKey } from "@/app/lib/page-visibility";

// Define the props interface for DashboardLayout
interface DashboardLayoutProps {
  children: React.ReactNode;
  // This component is reused as a manual wrapper by holding-summary,
  // quarterly-fees, and personal-details' page.tsx (imported directly,
  // not applied via Next's file-based layout nesting) — each must pass its
  // own page key so it's gated independently, not lumped under "dashboard".
  // Defaults to "dashboard" for /dashboard's own file-based layout usage,
  // which never passes this prop.
  page?: PageKey;
}

// Define the component as a React Functional Component
const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, page = "dashboard" }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // `null` = not yet checked, `true` = allowed; redirects to /maintenance
  // itself if hidden. See hooks/usePageVisibilityGate.ts.
  const allowed = usePageVisibilityGate(page);

  // Hold rendering until the visibility check resolves, to avoid a flash of
  // the dashboard before a hidden client is redirected to /maintenance.
  if (allowed !== true) {
    return (
      <div className="min-h-screen bg-primary-bg flex items-center justify-center">
        <div className="text-card-text-secondary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary-bg">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      <div className="lg:pl-64">
    <Header setSidebarOpen={setSidebarOpen} />
        <main className="p-6">
          <div className="max-w-8xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
