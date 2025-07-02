"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LoginPage from "@/components/login-page";
import DashboardPage from "./dashboard/page";

export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-primary-bg flex items-center justify-center">
        <div className="text-logo-green text-xl font-heading">Loading...</div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <LoginPage />;
  }

  return <DashboardPage />;
}