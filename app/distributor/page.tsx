"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRightIcon } from "@heroicons/react/24/outline";

const STRATEGIES = [
  {
    id: "qye",
    title: "QYE++",
    fullName: "Qode Yield Enhancer++",
  },
  {
    id: "qaw",
    title: "QAW++",
    fullName: "Qode All Weather++",
  },
] as const;

export default function DistributorPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect non-distributor users
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated" && session?.user?.accessType !== "distributor") {
      router.push("/");
      return;
    }
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-logo-green text-xl font-heading">Loading...</div>
      </div>
    );
  }

  if (session?.user?.accessType !== "distributor") {
    return null;
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Strategy cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {STRATEGIES.map((strategy) => (
          <Card
            key={strategy.id}
            className="cursor-pointer transition-all hover:shadow-lg hover:border-logo-green/40 bg-white"
            onClick={() => router.push(`/distributor/${strategy.id}`)}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-3xl font-heading text-logo-green">
                  {strategy.title}
                </CardTitle>
                <ArrowRightIcon className="h-6 w-6 text-card-text-secondary" />
              </div>
              <p className="text-sm text-card-text-secondary mt-2">
                {strategy.fullName}
              </p>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
