import { FindMyStore } from "@/components/nights/find-my-store";
import { PlanVisitButton } from "@/components/nights/plan-visit-sheet";
import { Card } from "@/components/ui/card";
import { PLAN_VISIT, PLAN_VISIT_HINT } from "@/lib/events/store-day-rules";

/**
 * Plan a visit, at the top of Rooms: one line of what it does, the
 * button that opens the sheet, and Find the store I'm in under them
 * for somebody already standing in one. The app's Rooms screen draws
 * the same card with the same words.
 */
export function PlanVisitCard({ signedIn }: { signedIn: boolean }) {
  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-text-secondary">{PLAN_VISIT_HINT}</p>
        <PlanVisitButton label={PLAN_VISIT} signedIn={signedIn} className="shrink-0" />
      </div>
      <FindMyStore />
    </Card>
  );
}
