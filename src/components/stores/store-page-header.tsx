import type { ReactNode } from "react";
import { Store as StoreIcon } from "lucide-react";

import { ProfileCover } from "@/components/players/profile-cover";
import { UltraMark } from "@/components/stores/ultra-mark";
import { VerifiedMark } from "@/components/stores/verified-mark";
import { Card } from "@/components/ui/card";

/**
 * The top of a store's page: banner, logo, name, marks, where it is.
 *
 * The founder: "think of the store pages similar to how players can
 * customize their pages. banner image, etc." So the block is the
 * player's own header, minus the cosmetics: a store is a business
 * page, and the decision with the founder was no frames and no rings
 * on it. The banner is the same short cover a player's profile draws
 * and the logo overlaps its bottom edge the way a picture does.
 *
 * One component because two surfaces draw it - the public page and
 * the wizard's preview - and "what you see in the console is what a
 * player sees" is only true while they share the code.
 *
 * Verified and Ultra are two separate marks because they mean two
 * different things: Verified is trust an admin granted, Ultra is the
 * plan the store pays for. The placeholder mark stands in for a logo
 * the store has not uploaded; an unclaimed listing never has one.
 */
export function StorePageHeader({
  name,
  verified,
  ultra,
  unclaimed,
  city,
  region,
  logoUrl,
  coverUrl,
  headingLevel = "h1",
  children,
}: {
  name: string;
  verified: boolean;
  ultra: boolean;
  unclaimed: boolean;
  city: string | null;
  region: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  /** The public page owns its h1; the wizard's preview sits under one. */
  headingLevel?: "h1" | "h2";
  /** The rest of the card, under the header. */
  children?: ReactNode;
}) {
  const Heading = headingLevel;
  const place = [city, region].filter(Boolean).join(", ");

  return (
    <Card className="relative flex flex-col gap-4 overflow-hidden">
      <ProfileCover coverUrl={coverUrl} short />

      {/* 88px down: the 64px logo straddles the banner's bottom edge at 144. */}
      <div className="relative mt-22 flex flex-col gap-1">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            width={64}
            height={64}
            className="size-16 rounded-xl border-4 border-surface bg-elevated object-cover"
          />
        ) : (
          <span className="flex size-16 items-center justify-center rounded-xl border-4 border-surface bg-elevated">
            <StoreIcon className="size-7 text-text-muted" aria-hidden="true" />
          </span>
        )}

        <Heading className="mt-2 flex flex-wrap items-center gap-2 text-xl font-bold text-text-primary">
          {name}
          {verified && <VerifiedMark className="size-5" />}
        </Heading>

        {ultra && (
          <p className="text-xs font-semibold tracking-[0.14em] text-text-secondary uppercase">
            cardflare <UltraMark /> store
          </p>
        )}

        {place && <p className="text-sm text-text-secondary">{place}</p>}

        {verified ? (
          <p className="text-xs text-text-muted">
            cardflare Verified means cardflare has confirmed that this profile is
            controlled by the listed business. It is not an endorsement or guarantee of
            the business.
          </p>
        ) : unclaimed ? (
          <p className="text-xs text-text-muted">Unclaimed listing</p>
        ) : null}
      </div>

      {children}
    </Card>
  );
}
