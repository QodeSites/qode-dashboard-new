"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { PAGE_LABELS, isPageKey } from "@/app/lib/page-visibility";

function MaintenanceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const hiddenPage = from && isPageKey(from) ? from : null;

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    window.location.href = "/";
  };

  const handleGoBack = () => {
    // The gate replaces the hidden page's history entry with this one
    // (router.replace, not push), so back() lands on whatever page the
    // client was on before they navigated into the hidden page.
    router.back();
  };

  return (
    <div className="min-h-screen bg-primary-bg flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-2">
          <h1
            className="text-3xl font-bold text-logo-green"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Qode
          </h1>
          <div className="w-16 h-1 bg-button-text mx-auto rounded-full" />
        </div>

        <div className="bg-white/60 rounded-2xl p-8 shadow-sm border border-card-text-secondary/10 space-y-4">
          <div className="text-4xl">🔧</div>
          <h2 className="text-xl font-semibold text-card-text">
            {hiddenPage
              ? `${PAGE_LABELS[hiddenPage]} Unavailable`
              : "Dashboard Under Maintenance"}
          </h2>
          <p className="text-sm text-card-text-secondary leading-relaxed">
            {hiddenPage
              ? "This section is temporarily unavailable. Please check back later or contact your relationship manager for assistance."
              : "Your dashboard is currently undergoing maintenance. Please check back later or contact your relationship manager for assistance."}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          {hiddenPage && (
            <Button
              onClick={handleGoBack}
              variant="outline"
              className="border-logo-green/20 text-card-text hover:bg-logo-green/5 px-8"
            >
              Go Back
            </Button>
          )}
          <Button
            onClick={handleSignOut}
            className="bg-logo-green text-button-text hover:bg-logo-green/90 px-8"
          >
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function MaintenancePage() {
  return (
    <Suspense fallback={null}>
      <MaintenanceContent />
    </Suspense>
  );
}
