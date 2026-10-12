import { Card } from "@/components/ui/card";
import type { MilestoneBoard } from "@/lib/players/milestones";

/**
 * Milestones in the Embers shop: what pays once, how far along each is,
 * and the pack each badge tier hands over. The app's MilestoneList
 * (mobile/src/milestone-list.tsx) draws the same rows.
 */
export function MilestoneList({ board }: { board: MilestoneBoard }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-text-primary">Milestones</h2>
        <p className="text-sm text-text-secondary">
          Embers once each, for the things cardflare is for. Every badge tier you reach
          puts a sealed pack in your hands.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {board.milestones.map((milestone) => (
          <li key={milestone.key} className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p
                className={`text-sm font-semibold ${milestone.done ? "text-text-muted" : "text-text-primary"}`}
              >
                {milestone.title}
              </p>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={milestone.goal}
                aria-valuenow={milestone.progress}
                aria-label={milestone.title}
                className="h-1 w-full overflow-hidden rounded-full bg-elevated"
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(milestone.progress / milestone.goal) * 100}%` }}
                />
              </div>
            </div>
            <span className="shrink-0 text-right text-xs font-bold tabular-nums">
              {milestone.done ? (
                <span className="text-accent">Earned</span>
              ) : (
                <span className="text-text-secondary">
                  {milestone.progress}/{milestone.goal} · +{milestone.embers}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        {board.tiers.map((tier) => (
          <span
            key={tier.tier}
            className={`rounded-full border px-3 py-1 text-xs font-bold tabular-nums ${
              tier.reached
                ? "border-accent/35 bg-accent/10 text-accent"
                : "border-border bg-elevated text-text-muted"
            }`}
          >
            {tier.tier} · {tier.reached ? "pack earned" : `${tier.earned} Embers`}
          </span>
        ))}
      </div>
    </Card>
  );
}
