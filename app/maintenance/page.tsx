"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function MaintenancePage() {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/");
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
            Dashboard Under Maintenance
          </h2>
          <p className="text-sm text-card-text-secondary leading-relaxed">
            Your dashboard is currently undergoing maintenance. Please check
            back later or contact your relationship manager for assistance.
          </p>
        </div>

        <Button
          onClick={handleSignOut}
          className="bg-logo-green text-button-text hover:bg-logo-green/90 px-8"
        >
          Sign Out
        </Button>
      </div>
    </div>
  );
}
