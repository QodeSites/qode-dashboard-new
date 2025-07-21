"use client";

import { Bars3Icon, BellIcon, ArrowRightOnRectangleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface HeaderProps {
  setSidebarOpen: (open: boolean) => void;
}

export default function Header({ setSidebarOpen }: HeaderProps) {
  const router = useRouter();
  const { data: session } = useSession();

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false });
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // Get user info from session with fallbacks
  const userName = session?.user?.name || "User";
  const userEmail = session?.user?.email || "";
  const userIcode = session?.user?.icode || "";
  const userInitials = userName
    .split(" ")
    .map(name => name.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="">
      <button
        type="button"
        className="-m-2.5 p-2.5 text-card-text-secondary lg:hidden"
        onClick={() => setSidebarOpen(true)}
      >
        <Bars3Icon className="h-6 w-6" />
      </button>


    </div>
  );
}