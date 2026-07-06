"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LoginPage from "@/components/login-page";
import HomePage from "./home/page";
import ManagedAccountsLanding from "@/components/ManagedAccountsLanding";

export default function Home() {
  const { status, data: session } = useSession();
  const router = useRouter();

  const accessType = (session?.user as any)?.accessType;

  useEffect(() => {
    if (status === "authenticated" && accessType === "admin") {
      router.replace("/dashboard");
    }
  }, [status, accessType, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-primary-bg flex items-center justify-center w-full max-w-full overflow-x-hidden">
        <div className="text-logo-green text-xl font-heading">Loading...</div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="w-full max-w-full overflow-x-hidden">
        <LoginPage />
      </div>
    );
  }

  // Admin — redirect to /dashboard (handled by useEffect above)
  if (accessType === "admin") {
    return (
      <div className="min-h-screen bg-primary-bg flex items-center justify-center w-full">
        <div className="text-logo-green text-xl font-heading">Redirecting…</div>
      </div>
    );
  }

  // Internal (sma) — ManagedAccountsLanding directly
  if (accessType === "internal") {
    return (
      <div className="w-full max-w-full overflow-x-hidden">
        <ManagedAccountsLanding />
      </div>
    );
  }

  // Client / distributor — standard HomePage with sidebar
  return (
    <div className="w-full max-w-full overflow-x-hidden">
      <HomePage />
    </div>
  );
}