"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LoginPage from "@/components/login-page";
import DashboardPage from "./dashboard/page";
import HomePage from "./home/page";
import ManagedAccountsLanding from "@/components/ManagedAccountsLanding";


// Emails that should see the Managed Accounts department dashboard
// instead of the default home page.
const MANAGED_ACCOUNTS_EMAILS = ["sma@qodeinvest.com"];

export default function Home() {
  const { status, data: session } = useSession();
  const router = useRouter();

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

 
    // return (
    //   <div className="w-full max-w-full overflow-x-hidden">
       
    //   </div>
    // );
  

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      <HomePage />
       <ManagedAccountsLanding />
    </div>
  );
}