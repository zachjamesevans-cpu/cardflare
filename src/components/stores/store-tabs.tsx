"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, MonitorPlay, PackageSearch, Settings } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * The console's tabs.
 *
 * The founder: "a lot of the things should be moved to tabs so it's
 * not just one big scrolling window. FlareCast for example should be a
 * tab at the top." Five places, each a page of its own: what to do
 * tonight, the television, the events, the case, and the settings a
 * store touches once. `?as=` rides every link so the area switcher's
 * choice survives a tab change.
 */
const TABS = [
  { href: "/store", label: "Overview", icon: Home },
  { href: "/store/event-hub", label: "FlareCast", icon: MonitorPlay },
  { href: "/store/events", label: "Events", icon: CalendarDays },
  { href: "/store/singles", label: "Singles", icon: PackageSearch },
  { href: "/store/settings", label: "Settings", icon: Settings },
] as const;

export function StoreTabs({ storeId }: { storeId: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Store console" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1 px-1">
        {TABS.map((tab) => {
          const active =
            tab.href === "/store"
              ? pathname === "/store"
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={`${tab.href}?as=${storeId}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-[var(--radius-control)] border px-3.5 py-2 text-sm font-semibold transition-colors",
                  active
                    ? "border-accent/60 bg-accent/15 text-text-primary"
                    : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary",
                )}
              >
                <tab.icon className="size-4" aria-hidden="true" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
