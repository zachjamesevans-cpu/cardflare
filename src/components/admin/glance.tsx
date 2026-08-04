import Link from "next/link";
import { ChevronRight, Flame } from "lucide-react";

import { Card } from "@/components/ui/card";

/** One number, one label. Everything on it is real and current. */
export function StatTile({
  icon: Icon,
  label,
  value,
  live = false,
}: {
  icon: typeof Flame;
  label: string;
  value: number;
  live?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <span className="flex items-center gap-2 text-sm text-text-secondary">
        <Icon className="size-4 text-text-muted" aria-hidden="true" />
        {label}
        {live && (
          <span
            className="size-1.5 rounded-full bg-accent"
            aria-hidden="true"
            title="Live"
          />
        )}
      </span>
      <span className="text-4xl font-semibold text-text-primary">{value}</span>
    </Card>
  );
}

/** A door into one of the lists, with its headline count on the front. */
export function AreaLink({
  href,
  icon: Icon,
  label,
  value,
  detail,
}: {
  href: string;
  icon: typeof Flame;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <Link href={href} className="group">
      <Card className="flex h-full flex-col gap-3 p-5 transition-colors duration-[var(--duration-base)] group-hover:border-accent/50">
        <span className="flex items-center justify-between gap-2 text-sm text-text-secondary">
          <span className="flex items-center gap-2">
            <Icon className="size-4 text-text-muted" aria-hidden="true" />
            {label}
          </span>
          <ChevronRight
            className="size-4 text-text-muted transition-transform duration-[var(--duration-base)] group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
        <span className="text-4xl font-semibold text-text-primary">{value}</span>
        <span className="text-xs text-text-muted">{detail}</span>
      </Card>
    </Link>
  );
}
