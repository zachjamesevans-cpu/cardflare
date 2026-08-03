import { OpenToTradesCard } from "@/components/cards/open-to-trades-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
 * A Server Component: the button is a form posting to a Server Action, so this
 * works before hydration and ships no JavaScript.
 */
export function OpenToTradesToggle({ code, open }: { code: string; open: boolean }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-11 shrink-0">
          <OpenToTradesCard />
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold text-text-primary">
            {open ? "You're open to trades" : "Not sure what you're after?"}
          </p>
          <p className="text-sm text-text-secondary">
            {open
              ? "You're on the board so people know to bring a binder over. Anyone here can see this."
              : "Say you're open to anything and you'll show up on the board, even without posting a card. Good if you'd rather be shown things than go looking."}
          </p>
        </div>
      </div>

      <form action={setOpenToTradesAction}>
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="open" value={open ? "off" : "on"} />
        <Button type="submit" variant={open ? "secondary" : "primary"} size="sm">
          {open ? "Never mind" : "I'm open to trades"}
        </Button>
      </form>
    </Card>
  );
}
