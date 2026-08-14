"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { PageKey } from "@/app/lib/page-visibility";

/**
 * Page-level visibility gate, extracted from the original /dashboard-only
 * check. Only clients (`accessType === "client"`) are ever gated — admins/
 * distributors/partners (including admins impersonating) always pass, same
 * as before. Runs as a normal same-origin browser fetch rather than
 * middleware, since middleware redirects proved unreliable behind the
 * production proxy.
 *
 * Returns `true` once the page should render, `null` while the check is
 * still in flight (caller should hold rendering to avoid a flash of
 * content before a hidden client is redirected).
 */
export function usePageVisibilityGate(page: PageKey): boolean | null {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (status === "loading") return;

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
    fetch(`/api/dashboard-visibility/check?icode=${encodeURIComponent(icode)}&page=${encodeURIComponent(page)}`)
      .then((res) => (res.ok ? res.json() : { dashboard_visible: true }))
      .then((data) => {
        if (cancelled) return;
        if (data?.dashboard_visible === false) {
          router.replace(`/maintenance?from=${encodeURIComponent(page)}`);
        } else {
          setAllowed(true);
        }
      })
      .catch(() => {
        // Network/endpoint failure: fail open so we never lock out a client
        // who should have access. Hidden clients are still gated when the
        // check succeeds, which is the normal path.
        if (!cancelled) setAllowed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.accessType, session?.user?.icode, page, router]);

  return allowed;
}
