"use client"

import { Fragment, use } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Dialog, Transition } from "@headlessui/react"
import {
  HomeIcon,
  ChartBarIcon,
  XMarkIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline"
import { cn } from "@/lib/utils"
import { signOut, useSession } from "next-auth/react"
import { Button } from "./ui/button"
import { useRouter } from "next/navigation"
const navigation = [
  { name: "Home", href: "/", icon: HomeIcon },
  { name: "Portfolio", href: "/dashboard", icon: ChartBarIcon },
  { name: "Personal Details", href: "/personal-details", icon: UserCircleIcon },
];

interface SidebarProps {
  open: boolean
  setOpen: (open: boolean) => void
}

export function Sidebar({ open, setOpen }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  return (
    <>
      {/* Mobile sidebar */}
      <Transition.Root show={open} as={Fragment}>
        <Dialog as="div" className="relative z-50 lg:hidden" onClose={setOpen}>
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/50" />
          </Transition.Child>

          <div className="fixed inset-0 flex">
            <Transition.Child
              as={Fragment}
              enter="transition ease-in-out duration-300 transform"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition ease-in-out duration-300 transform"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <Dialog.Panel className="relative mr-16 flex w-full max-w-xs flex-1">
                <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                  <button type="button" className="p-4" onClick={() => setOpen(false)}>
                    <XMarkIcon className="h-6 w-6 text-card-text" />
                  </button>
                </div>
                <SidebarContent pathname={pathname} />
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <SidebarContent pathname={pathname} />
      </div>
    </>
  )
}

function SidebarContent({ pathname }: { pathname: string }) {
  const { data: session } = useSession();
  
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

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false });
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-primary-bg px-6 pb-4">
      <div className="flex h-16 shrink-0 items-center">
        <h1 className="text-3xl font-serif font-bold text-logo-green">Qode</h1>
      </div>
      <nav className="flex flex-1 flex-col justify-center">
        <ul role="list" className="flex flex-col gap-y-7">
          <li>
            <ul role="list" className="-mx-2 space-y-1">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={cn(
                      pathname === item.href
                        ? "bg-white/50 text-logo-green card-shadow"
                        : "text-card-text-secondary hover:bg-white/50 hover:text-logo-green",
                      "group flex gap-x-3 rounded-lg p-3 text-sm leading-6 font-medium transition-all duration-200",
                    )}
                  >
                    <item.icon
                      className={cn(
                        pathname === item.href
                          ? "text-logo-green"
                          : "text-card-text-secondary group-hover:text-logo-green",
                        "h-6 w-6 shrink-0",
                      )}
                    />
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        </ul>
      </nav>
      <div className="mt-auto">
        <div className="flex items-center gap-x-4 lg:gap-x-6">
          <div className="flex items-center gap-x-3">
            <div className="h-8 w-8 rounded-full bg-logo-green flex items-center justify-center">
              <span className="text-sm font-medium text-button-text">{userInitials}</span>
            </div>
            <div className="hidden lg:flex lg:flex-col">
              <p className="text-sm font-medium text-card-text">{userName}</p>
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
  )
}