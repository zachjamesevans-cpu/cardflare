import { CircleAlert, CircleCheck, CircleX } from "lucide-react";

import { Badge, Card } from "@/components/ui/card";
import {
  configGroups,
  groupStatus,
  type CheckStatus,
  type ConfigCheck,
  type ConfigFacts,
} from "@/lib/diagnostics/config";

const ICONS: Record<CheckStatus, { Icon: typeof CircleCheck; tone: string }> = {
  ok: { Icon: CircleCheck, tone: "text-accent" },
  warn: { Icon: CircleAlert, tone: "text-warning" },
  missing: { Icon: CircleX, tone: "text-danger" },
};

const SUMMARY: Record<CheckStatus, string> = {
  ok: "Ready",
  warn: "Check this",
  missing: "Incomplete",
};

function CheckRow({ check }: { check: ConfigCheck }) {
  const { Icon, tone } = ICONS[check.status];

  return (
    <li className="flex items-start gap-3">
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm font-medium text-text-primary">
          {check.label}{" "}
          <code className="text-xs font-normal text-text-muted">{check.variable}</code>
        </p>
        <p className="text-sm text-text-secondary">{check.detail}</p>
      </div>
    </li>
  );
}

/**
 * What the running server sees of its own configuration.
 *
 * Deliberately reports presence, not values — the only value shown is the from
 * address, which every recipient already sees. Reading this off the live
 * deployment is the fastest way to tell "the variable is missing" from "the
 * variable is set and something else is wrong", which are otherwise
 * indistinguishable from the outside.
 */
export function ConfigStatus({ facts }: { facts: ConfigFacts }) {
  const groups = configGroups(facts);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => {
        const status = groupStatus(group);

        return (
          <Card key={group.title} className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-text-primary">{group.title}</h3>
              <Badge tone={status === "ok" ? "accent" : "neutral"}>
                {SUMMARY[status]}
              </Badge>
            </div>

            <ul className="flex flex-col gap-3">
              {group.checks.map((check) => (
                <CheckRow key={check.variable} check={check} />
              ))}
            </ul>

            {status !== "ok" && (
              <p className="border-t border-border pt-3 text-sm text-text-muted">
                {group.whenIncomplete}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
