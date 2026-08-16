import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { resolveEquipped, wardrobeFor } from "@/lib/players/cosmetics";
import {
  addToShowcase,
  dressAllShowcase,
  dressShowcaseCard,
  markOnboarded,
  needsSetup,
  ownProfile,
  removeFromShowcase,
  SHOWCASE_LIMIT,
  setDisplayName,
} from "@/lib/players/profile";
import { buyCosmetic } from "@/lib/players/cosmetics";
import { avatarWearFor } from "@/lib/players/equips";
import type { CosmeticArtFile } from "@/lib/players/art-files";
import { displayNameSchema } from "@/lib/players/profile-schema";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Art the phone can actually fetch.
 *
 * Seeded art ships in the repo and is stored as "/cosmetics/x.svg",
 * which resolves for a browser sitting on the site and to nothing at
 * all for a native client. The same rule the avatars follow.
 */
function absoluteArt(art: CosmeticArtFile | null): CosmeticArtFile | null {
  if (!art) return null;
  return art.url.startsWith("/") ? { ...art, url: `${siteUrl()}${art.url}` } : art;
}

/**
 * The app's Profile tab, in one request each way.
 *
 * The same lib calls the website's `/profile` page makes, so the two
 * clients can never disagree about what a profile contains — the rule
 * `/me` already follows.
 *
 * The balance is in the GET response, and safely so: this endpoint only
 * ever answers for the authenticated player, resolved from the bearer
 * token. There is deliberately no way to ask it about anybody else —
 * looking at another player's profile is a website surface for now
 * (`/p/<id>`, which reads through `publicProfile` and therefore returns
 * a shape with no balance field in it at all), and the app will get its
 * own screen rather than a query parameter bolted onto this one.
 *
 * Avatars are deliberately NOT uploadable here. A multipart upload from
 * a native client is a different transport with a different failure mode,
 * and the app's writes already ride in a header rather than a body
 * because of what the proxy does to POST payloads. Picture changes go
 * through the website for now, and the app says so rather than offering
 * a button that fails.
 */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const profile = await ownProfile(player.playerId);
  if (!profile) return Response.json({ error: "not-found" }, { status: 404 });

  const [wardrobe, worn, wearing] = await Promise.all([
    wardrobeFor(
      player.playerId,
      { earned: profile.embersEarned, balance: profile.embersBalance },
      profile.equipped,
    ),
    resolveEquipped(profile.equipped),
    avatarWearFor([player.playerId]),
  ]);

  const wear = wearing.get(player.playerId);

  return Response.json({
    profile: {
      playerId: profile.playerId,
      displayName: profile.displayName,
      /*
       * Absolute, because a native client has no origin to resolve
       * "/api/avatars/..." against. The website gets the relative form
       * from the same lib call; only the envelope differs.
       */
      avatarUrl: profile.avatarUrl?.startsWith("/")
        ? `${siteUrl()}${profile.avatarUrl}`
        : profile.avatarUrl,
      coverUrl: profile.coverUrl?.startsWith("/")
        ? `${siteUrl()}${profile.coverUrl}`
        : profile.coverUrl,
      embersEarned: profile.embersEarned,
      embersBalance: profile.embersBalance,
      equipped: worn,
      /*
       * The worn profile border and avatar effect, and the files
       * behind them. The app draws these itself now rather than
       * carrying them unused: one WebView with scripting off is the
       * native answer to the website's `<img>` and sandboxed frame.
       */
      wear: {
        ring: wear?.ring ?? null,
        aura: wear?.aura ?? null,
        ringArt: absoluteArt(wear?.ringArt ?? null),
        auraArt: absoluteArt(wear?.auraArt ?? null),
      },
      showcase: profile.showcase,
      showcaseLimit: SHOWCASE_LIMIT,
    },
    wardrobe,
    /* An account that never chose a username finishes that first - the
       same wizard the website runs at /welcome/username. */
    needsSetup: await needsSetup(player.playerId),
  });
}

/**
 * Everything the tab can change, as one discriminated action.
 *
 * One endpoint rather than four, because the app's transport puts its
 * payload in a header and every additional route is another thing to get
 * wrong in the proxy. The player is re-derived from the bearer token on
 * every call; nothing in the payload identifies who is acting.
 */
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), displayName: z.string() }),
  z.object({ action: z.literal("choose-username"), displayName: z.string() }),
  z.object({
    action: z.literal("buy"),
    slug: z.string().max(40),
    /*
     * Which slot a frame lands in, since the profile/card border split.
     * Optional: an app that predates the split omits it and gets the
     * card slot, which is what the old single slot became.
     */
    slot: z.enum(["avatarFrame", "cardFrame", "holo", "effect"]).optional(),
  }),
  z.object({
    action: z.literal("showcase-add"),
    cardId: z.string().uuid(),
    printingId: z.string().uuid().nullable().optional(),
    /* The dressing chosen at add time. Unowned slugs resolve to the
       default server-side, same as the website's add flow. */
    frame: z.string().max(40).nullable().optional(),
    holo: z.string().max(40).nullable().optional(),
  }),
  z.object({ action: z.literal("showcase-remove"), entryId: z.string().uuid() }),
  z.object({
    action: z.literal("showcase-dress"),
    entryId: z.string().uuid(),
    frame: z.string().max(40).nullable(),
    holo: z.string().max(40).nullable(),
  }),
  z.object({
    action: z.literal("showcase-dress-all"),
    frame: z.string().max(40).nullable(),
    holo: z.string().max(40).nullable(),
  }),
]);

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = actionSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised profile action");

  const body = parsed.data;

  if (body.action === "choose-username") {
    const name = displayNameSchema.safeParse({ displayName: body.displayName });
    if (!name.success) {
      return badRequest(name.error.issues[0]?.message ?? "That name will not work.");
    }

    const outcome = await setDisplayName(player.playerId, name.data.displayName);

    if (outcome === "taken") {
      return badRequest("Somebody already goes by that. Pick another one.");
    }
    if (outcome !== "renamed") {
      return Response.json({ error: "unavailable" }, { status: 503 });
    }

    /* The name is the gate, same as the website: setup counts as done
       the moment one is chosen. */
    await markOnboarded(player.playerId);
    return Response.json({ ok: true });
  }

  if (body.action === "rename") {
    const name = displayNameSchema.safeParse({ displayName: body.displayName });
    if (!name.success) {
      return badRequest(name.error.issues[0]?.message ?? "That name will not work.");
    }

    const outcome = await setDisplayName(player.playerId, name.data.displayName);

    if (outcome === "taken") {
      return badRequest("Somebody already goes by that. Pick another one.");
    }

    return outcome === "renamed"
      ? Response.json({ ok: true })
      : Response.json({ error: "unavailable" }, { status: 503 });
  }

  if (body.action === "buy") {
    const outcome = await buyCosmetic(player.playerId, body.slug, body.slot);
    return outcome.ok
      ? Response.json({ ok: true, slug: outcome.slug })
      : Response.json({ error: outcome.reason }, { status: 400 });
  }

  if (body.action === "showcase-add") {
    const outcome = await addToShowcase(
      player.playerId,
      body.cardId,
      body.printingId ?? null,
      { frame: body.frame ?? null, holo: body.holo ?? null },
    );
    return outcome.ok
      ? Response.json({ ok: true })
      : Response.json({ error: outcome.reason }, { status: 400 });
  }

  if (body.action === "showcase-dress") {
    const done = await dressShowcaseCard(
      player.playerId,
      body.entryId,
      body.frame,
      body.holo,
    );
    return done
      ? Response.json({ ok: true })
      : Response.json({ error: "unavailable" }, { status: 503 });
  }

  if (body.action === "showcase-dress-all") {
    const done = await dressAllShowcase(player.playerId, body.frame, body.holo);
    return done
      ? Response.json({ ok: true })
      : Response.json({ error: "unavailable" }, { status: 503 });
  }

  const removed = await removeFromShowcase(player.playerId, body.entryId);
  return removed
    ? Response.json({ ok: true })
    : Response.json({ error: "unavailable" }, { status: 503 });
}
