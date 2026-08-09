import { EventRoomPreview } from "@/components/app-preview/event-room-preview";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { ANCHORS, WAITLIST_ANCHOR } from "@/lib/site";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-flare-wash px-5 pt-14 pb-16 sm:px-6 md:pt-20 md:pb-20">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
        <div className="flex flex-col items-start gap-6">
          <Badge>
            <span className="size-1.5 rounded-full bg-accent" />
            Now building &middot; One Piece Card Game first
          </Badge>

          <h1 className="text-4xl font-bold tracking-tight text-balance text-text-primary sm:text-5xl lg:text-6xl">
            Find the card.
            <br />
            <span className="text-accent">Make the trade.</span>
          </h1>

          <p className="max-w-xl text-lg leading-relaxed text-pretty text-text-secondary">
            One hub for the whole room: the people hunting cards and the people selling
            them. Players post what they need the moment they walk in, and CardFlare
            points them at whoever has it: another player at a game-store event, a
            vendor&rsquo;s booth at a show. Buyers stop searching. Sellers stop waiting.
          </p>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <ButtonLink
              href={WAITLIST_ANCHOR}
              size="lg"
              className="w-full sm:w-auto"
              data-analytics-event="primary_cta_clicked"
            >
              Join the Waitlist
            </ButtonLink>
            <ButtonLink
              href={ANCHORS.howItWorks}
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
            >
              See How It Works
            </ButtonLink>
          </div>
        </div>

        <div className="flex justify-center md:justify-end">
          <EventRoomPreview />
        </div>
      </div>
    </section>
  );
}
