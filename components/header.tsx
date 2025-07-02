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
    <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 px-4 sm:gap-x-6 sm:px-6 lg:px-8">
      <button
        type="button"
        className="-m-2.5 p-2.5 text-card-text-secondary lg:hidden"
        onClick={() => setSidebarOpen(true)}
      >
        <Bars3Icon className="h-6 w-6" />
      </button>

      <div className="h-6 w-px bg-card-text-secondary/30 lg:hidden" />

      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div className="relative flex flex-1"></div>
        <div className="flex items-center gap-x-4 lg:gap-x-6">
          <Button variant="ghost" size="icon" className="text-card-text-secondary hover:text-logo-green">
            <BellIcon className="h-6 w-6" />
          </Button>

          <div className="hidden lg:block lg:h-6 lg:w-px bg-gray-200/10" />

          <div className="flex items-center gap-x-3">
            <div className="h-8 w-8 rounded-full bg-logo-green flex items-center justify-center">
              <span className="text-sm font-medium text-button-text">{userInitials}</span>
            </div>
            <div className="hidden lg:flex lg:flex-col">
              <p className="text-sm font-medium text-card-text">{userName}</p>
              {userEmail && (
                <p className="text-xs text-card-text-secondary">{userEmail}</p>
              )}
              {userIcode && (
                <p className="text-xs text-card-text-secondary">{userIcode}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="text-card-text-secondary hover:text-logo-green"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}