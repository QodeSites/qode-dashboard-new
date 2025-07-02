"use client"

import { Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Dialog, Transition } from "@headlessui/react"
import {
  HomeIcon,
  FolderIcon,
  UsersIcon,
  ChartBarIcon,
  CogIcon,
  XMarkIcon,
  DocumentTextIcon,
  CreditCardIcon,
} from "@heroicons/react/24/outline"
import { cn } from "@/lib/utils"

const navigation = [
  { name: "Dashboard", href: "/", icon: HomeIcon },
  // { name: "Projects", href: "/projects", icon: FolderIcon },
  // { name: "Clients", href: "/clients", icon: UsersIcon },
  // { name: "Analytics", href: "/analytics", icon: ChartBarIcon },
  // { name: "Invoices", href: "/invoices", icon: CreditCardIcon },
  // { name: "Documents", href: "/documents", icon: DocumentTextIcon },
  // { name: "Settings", href: "/settings", icon: CogIcon },
]

interface SidebarProps {
  open: boolean
  setOpen: (open: boolean) => void
}

export function Sidebar({ open, setOpen }: SidebarProps) {
  const pathname = usePathname()

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
                  <button type="button" className="-m-2.5 p-2.5" onClick={() => setOpen(false)}>
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
  return (
    <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-primary-bg px-6 pb-4">
      <div className="flex h-16 shrink-0 items-center">
        <h1 className="text-3xl font-serif font-bold text-logo-green">Qode</h1>
      </div>
      <nav className="flex flex-1 flex-col">
        <ul role="list" className="flex flex-1 flex-col gap-y-7">
          <li>
            <ul role="list" className="-mx-2 space-y-1">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={cn(
                      pathname === item.href
                        ? "bg-white/70 text-logo-green card-shadow"
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
    </div>
  )
}
