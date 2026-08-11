import { OpenToTradesCard } from "@/components/cards/open-to-trades-card";
import { Button } from "@/components/ui/button";
import { setOpenToTradesAction } from "@/lib/events/join-event-actions";

/**
 * "I'm not after anything specific."
 *
 * Most of a room is not hunting a card. Somebody new has never seen half
 * of what is in the binders around them and could not name what they
 * want; somebody else just fancies a trade. Before this they had nothing
 * to post, so they did not appear on the Flare board at all — and the
 * board is what people read to decide who to walk over to.
 *
 * One slim row now, not a card of its own: the founder's call, a whole
 * block was too much furniture for one switch. It rents the bottom of
 * the Post-a-Flare card, under a divider — same block, because it is
 * the other answer to the same question, but visually apart from the
 * form fields so it cannot be read as a property of the Flare being
 * typed above it. It is your status in this room, not the post's.
 *
 * A Server Component: the button is a form posting to a Server Action,
 * so this works before hydration and ships no JavaScript.
 */
export function OpenToTradesToggle({ code, open }: { code: string; open: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-4">
      <div className="w-6 shrink-0">
        <OpenToTradesCard />
      </div>

      <p className="min-w-0 flex-1 basis-40 text-sm text-text-secondary">
        {open ? (
          <span className="text-text-primary">
            You&rsquo;re on the board: open to any trade.
          </span>
        ) : (
          "Nothing specific? Go on the board as open to any trade."
        )}
      </p>

      <form action={setOpenToTradesAction} className="shrink-0">
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="open" value={open ? "off" : "on"} />
        <Button type="submit" variant={open ? "secondary" : "primary"} size="sm">
          {open ? "Never mind" : "I'm open to trades"}
        </Button>
      </form>
    </div>
  );
}
