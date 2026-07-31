import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { SITE } from "@/lib/site";

interface AppShellProps {
  /** Shown beside the logo so it is obvious which area you are in. */
  area: string;
  email: string;
  title: string;
  description?: string;
  children: ReactNode;
}

/** Chrome for the signed-in areas. Deliberately plainer than the landing page. */
export function AppShell({ area, email, title, description, children }: AppShellProps) {
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" aria-label={`${SITE.name} home`}>
              <Logo size={30} priority />
            </Link>
            <span
              aria-hidden="true"
              className="hidden h-5 w-px shrink-0 bg-border sm:block"
            />
            <span className="hidden text-sm font-medium text-text-muted sm:block">
              {area}
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-sm text-text-muted md:block">
              {email}
            </span>
            <form action={signOut}>
              <Button type="submit" variant="secondary" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1 px-5 py-10 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
              {title}
            </h1>
            {description && (
              <p className="max-w-2xl text-pretty text-text-secondary">{description}</p>
            )}
          </div>

          {children}
        </div>
      </main>
    </>
  );
}
