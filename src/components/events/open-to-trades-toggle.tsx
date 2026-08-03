import { OpenToTradesCard } from "@/components/cards/open-to-trades-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { setOpenToTradesAction } from "@/lib/events/join-event-actions";

/**
 * "I'm not after anything specific."
 *
 * Most of a room is not hunting a card. Somebody new has never seen half of
 * what is in the binders around them and could not name what they want;
 * somebody else just fancies a trade. Before this they had nothing to post, so
 * they did not appear on the Flare board at all — and the board is what people
 * read to decide who to walk over to.
 *
 * It sits directly under the Post-a-Flare form, because it is the other
 * answer to the same question. It used to be its own card further up the
 * page, next to nothing in particular, and founder feedback was that people
 * looking to say "open to anything" never connected it with posting — the
 * moment somebody thinks "I don't know what to search for" is the moment this
 * needs to be in front of them.
 *
 * A Server Component: the button is a form posting to a Server Action, so this
 * works before hydration and ships no JavaScript.
 */
export function OpenToTradesToggle({ code, open }: { code: string; open: boolean }) {
  return (
    <Card
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 p-4",
        open && "border-accent/40 bg-accent/[0.05]",
      )}
    >
      <div className="w-9 shrink-0">
        <OpenToTradesCard />
      </div>

      <div className="flex min-w-0 flex-1 basis-52 flex-col">
        <p className="font-semibold text-text-primary">
          {open
            ? "You're on the board: open to trades"
            : "Not after anything specific?"}
        </p>
        <p className="text-sm text-text-secondary">
          {open
            ? "Anyone in this room can see it — people can bring a binder to you."
            : "Skip the search and put yourself on the board as open to any trade."}
        </p>
      </div>

      <form action={setOpenToTradesAction} className="shrink-0">
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="open" value={open ? "off" : "on"} />
        <Button type="submit" variant={open ? "secondary" : "primary"} size="sm">
          {open ? "Never mind" : "I'm open to trades"}
        </Button>
      </form>
    </Card>
  );
}
