"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Sidebar } from "@/components/sidebar";
import Header from "@/components/header";

// Define the props interface for DashboardLayout
interface DashboardLayoutProps {
  children: React.ReactNode;
}

// Define the component as a React Functional Component
const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();

  // Dashboard visibility gate (replaces the middleware redirect, which was
  // unreliable behind the production proxy). Runs as a normal same-origin
  // browser fetch, so it works regardless of the server/proxy setup.
  // `null` = not yet checked, `true`/`false` = result.
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (status === "loading") return;

    // Only clients are gated. Admins/distributors (incl. admins impersonating)
    // are never blocked — mirrors the previous middleware behavior.
    const accessType = session?.user?.accessType;
    if (accessType !== "client") {
      setAllowed(true);
      return;
    }

    const icode = session?.user?.icode;
    if (!icode) {
      setAllowed(true);
      return;
    }

    let cancelled = false;
    fetch(`/api/dashboard-visibility/check?icode=${encodeURIComponent(icode)}`)
      .then((res) => (res.ok ? res.json() : { dashboard_visible: true }))
      .then((data) => {
        if (cancelled) return;
        if (data?.dashboard_visible === false) {
          router.replace("/maintenance");
        } else {
          setAllowed(true);
        }
      })
      .catch(() => {
        // Network/endpoint failure: fail open so we never lock out a client
        // who should have access. (Hidden clients are still gated when the
        // check succeeds, which is the normal path.)
        if (!cancelled) setAllowed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.accessType, session?.user?.icode, router]);

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
