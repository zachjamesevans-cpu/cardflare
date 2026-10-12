import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { NewMessageComposer } from "@/components/nearby/new-message-composer";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { BackLink } from "@/components/ui/back-link";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { cardImageAlt } from "@/lib/cards/images";
import { askPreview } from "@/lib/nearby/answer";
import { ANSWER_GONE, answerDraft } from "@/lib/nearby/shared";
import { playerForUser } from "@/lib/players/accounts";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "New message",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A conversation not started yet, laid out the way Messages lays one
 * out: who, the card it is about, and the composer with "I have <card>.
 * Are you looking to trade for it?" already in it. The founder: "people
 * would further understand what's happening if it goes into an inbox
 * style view." Nothing exists until Send - an empty conversation would
 * land in the other person's Messages with nothing in it. The app's
 * NewMessageScreen is the same.
 */
export default async function NewMessagePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; id?: string }>;
}) {
  const params = await searchParams;
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") {
    redirect(
      `/login?next=${encodeURIComponent(`/local/new?kind=${params.kind ?? ""}&id=${params.id ?? ""}`)}`,
    );
  }

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);

  const ask: { kind: "want" | "flare"; id: string } | null =
    (params.kind === "want" || params.kind === "flare") && UUID.test(params.id ?? "")
      ? { kind: params.kind, id: params.id as string }
      : null;
  const preview = playerId && ask ? await askPreview(playerId, ask) : null;
  const first = preview?.displayName.split(" ")[0] ?? "";

  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-5 px-5 pt-6 pb-16 sm:gap-8 sm:pt-12"
      >
        <Link href="/feed" aria-label={`${SITE.name} feed`}>
          <Logo size={40} priority />
        </Link>

        <div className="flex w-full max-w-2xl flex-col gap-4">
          <span className="flex items-center gap-1">
            <BackLink href="/feed/wanted" />
            <h1 className="text-xl font-bold text-text-primary">
              {preview ? preview.displayName : "New message"}
            </h1>
          </span>

          {!preview || !ask ? (
            <Card className="py-10 text-center">
              <p className="text-text-secondary">{ANSWER_GONE}</p>
            </Card>
          ) : (
            <Card className="flex flex-col overflow-hidden p-0">
              <p className="border-b border-border px-4 py-2 text-sm text-text-muted">
                About {preview.cardName}
              </p>
              <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                <PlayerAvatar
                  displayName={preview.displayName}
                  seed={preview.playerId}
                  avatarUrl={preview.avatarUrl}
                  size="lg"
                />
                <p className="font-semibold text-text-primary">{preview.displayName}</p>
                {preview.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={preview.imageUrl}
                    alt={cardImageAlt(preview.cardName, "")}
                    className="aspect-[60/84] w-24 rounded-[6px] border border-border bg-elevated object-contain"
                  />
                )}
                <p className="max-w-xs text-sm text-text-muted">
                  {first} is looking for this. Your message goes to them when you press
                  Send.
                </p>
              </div>
              <NewMessageComposer
                ask={ask}
                draft={answerDraft(preview.cardName)}
                firstName={first}
              />
            </Card>
          )}
        </div>

        <TabBarSpacer />
      </main>

      <PlayerTabBar />
    </>
  );
}
