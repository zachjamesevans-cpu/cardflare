/* eslint-disable @next/next/no-img-element -- the image renderer (Satori)
   draws only plain <img>; next/image does not exist inside an ImageResponse. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import "server-only";

import { BINDER_COVERS, DEFAULT_BINDER_COVER } from "./covers";
import { isRenderableImageUrl } from "@/lib/cards/images";
import { avatarSrc } from "@/lib/players/profile-image";
import { SITE, siteUrl } from "@/lib/site";
import type { Binder } from "./binder";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 };

/**
 * The picture a shared binder link unfurls with, drawn as the binder
 * itself: its own cover colours behind an open page of nine pockets,
 * the owner's face and name, what the binder is called and how many
 * cards it holds, and the wordmark small in a corner.
 *
 * The first version came out blank in Discord. Card art is stored as
 * site-relative paths (/api/card-art/...), and the image renderer has no
 * origin to resolve them against, so every picture failed. Every image
 * here is fetched on the server and handed over as PNG bytes instead,
 * which also covers art served as WebP, which the renderer cannot read.
 * A picture that will not load leaves an empty pocket, never a broken
 * card.
 *
 * Colours are read from the @theme block in globals.css rather than
 * copied, because the renderer resolves no CSS variables and a second
 * list would drift.
 */

async function themeColours(): Promise<Map<string, string>> {
  const css = await readFile(join(process.cwd(), "src/app/globals.css"), "utf8");
  const colours = new Map<string, string>();
  for (const match of css.matchAll(
    /--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g,
  )) {
    if (!colours.has(match[1])) colours.set(match[1], match[2]);
  }
  return colours;
}

/** "var(--color-ember-deep)" -> the hex the theme gives it. */
function resolveVar(
  value: string,
  colours: Map<string, string>,
  fallback: string,
): string {
  const name = /var\(--color-([a-z0-9-]+)\)/.exec(value)?.[1];
  return (name && colours.get(name)) || fallback;
}

/** An image as PNG bytes in a data URI, at the size it is drawn, or null. */
async function asPng(url: string, width: number, height: number, round = false) {
  /* Loaded here, not at the top: a host where the native encoder failed
     to load loses the pictures, never the whole preview (see
     tests/unit/native-modules.test.ts). */
  let sharp: typeof import("sharp").default;
  try {
    sharp = (await import("sharp")).default;
  } catch (failed) {
    console.error("The image encoder failed to load", failed);
    return null;
  }
  try {
    const absolute = url.startsWith("/") ? `${siteUrl()}${url}` : url;
    const response = await fetch(absolute, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    let image = sharp(Buffer.from(await response.arrayBuffer())).resize(width, height, {
      fit: "cover",
    });
    if (round) {
      const mask = Buffer.from(
        `<svg width="${width}" height="${height}"><circle cx="${width / 2}" cy="${height / 2}" r="${width / 2}"/></svg>`,
      );
      image = image.composite([{ input: mask, blend: "dest-in" }]);
    }
    const png = await image.png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

async function ownerAvatar(ownerId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabaseAdmin()
    .from("players")
    .select("avatar_url")
    .eq("id", ownerId)
    .maybeSingle();
  const src = avatarSrc(data?.avatar_url);
  return src ? asPng(src, 88, 88, true) : null;
}

/* Sized so three rows fit the 630-high card inside its padding, and the
   grid's width counts its own padding and border (the renderer sizes
   boxes border-box), or the third column wraps. */
const POCKET = { width: 104, height: 145 };
const POCKET_GAP = 12;
const PAGE_PADDING = 20;
const PAGE_BORDER = 2;

/**
 * The picture itself, for a binder (or null: the plain card). The page's
 * opengraph-image loads the binder and the owner; this only draws.
 */
export async function binderShareImage(
  binder: Pick<Binder, "name" | "ownerName" | "count" | "cover" | "cards"> | null,
  ownerId: string | null,
): Promise<ImageResponse> {
  const colours = await themeColours();
  const owner = ownerId;
  const cover =
    BINDER_COVERS.find((entry) => entry.id === binder?.cover) ??
    BINDER_COVERS.find((entry) => entry.id === DEFAULT_BINDER_COVER)!;
  const edge = resolveVar(cover.edge, colours, "#1d232c");
  const spine = resolveVar(cover.spine, colours, "#000000");
  const canvas = colours.get("canvas") ?? "#000000";
  const surface = colours.get("surface") ?? "#151a21";
  const border = colours.get("border") ?? "#2a323d";
  const accent = colours.get("accent") ?? "#c6ee4f";
  const textPrimary = colours.get("text-primary") ?? "#f2f5f7";

  /* The first page: pockets 0 to 8, gaps and all. */
  const firstPage = Array.from({ length: 9 }, (_, pocket) =>
    binder?.cards.find((card) => card.pocket === pocket),
  );
  const [art, avatar, wordmark] = await Promise.all([
    Promise.all(
      firstPage.map((card) =>
        card?.imageUrl && isRenderableImageUrl(card.imageUrl)
          ? asPng(card.imageUrl, POCKET.width * 2, POCKET.height * 2)
          : Promise.resolve(null),
      ),
    ),
    owner ? ownerAvatar(owner) : Promise.resolve(null),
    readFile(join(process.cwd(), "public/brand/cardflare-wordmark-cut.png")),
  ]);
  const markHeight = 34;
  const markWidth = Math.round(
    markHeight * (wordmark.readUInt32BE(16) / wordmark.readUInt32BE(20)),
  );
  const initial = (binder?.ownerName ?? "?").trim().charAt(0).toUpperCase();
  const count = binder?.count ?? 0;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "56px 64px",
        background: `linear-gradient(110deg, ${spine} 0%, ${edge} 100%)`,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100%",
          width: 520,
          padding: 36,
          borderRadius: 28,
          background: `${canvas}d9`,
          border: `2px solid ${border}`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {avatar ? (
              <img
                src={avatar}
                width={88}
                height={88}
                alt=""
                style={{ borderRadius: 44 }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 88,
                  height: 88,
                  borderRadius: 44,
                  background: surface,
                  border: `2px solid ${border}`,
                  color: accent,
                  fontSize: 40,
                  fontWeight: 800,
                }}
              >
                {initial}
              </div>
            )}
            <div
              style={{
                display: "flex",
                fontSize: 34,
                fontWeight: 700,
                color: textPrimary,
              }}
            >
              {binder ? binder.ownerName : SITE.name}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 60,
              fontWeight: 800,
              lineHeight: 1.05,
              color: textPrimary,
            }}
          >
            {binder ? binder.name : "A binder"}
          </div>
          <div
            style={{ display: "flex", fontSize: 30, fontWeight: 700, color: accent }}
          >
            {binder
              ? `${count} ${count === 1 ? "card" : "cards"} up for trade`
              : "Up for trade"}
          </div>
        </div>
        <img
          src={`data:image/png;base64,${wordmark.toString("base64")}`}
          width={markWidth}
          height={markHeight}
          alt=""
        />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: POCKET_GAP,
          width: POCKET.width * 3 + POCKET_GAP * 2 + PAGE_PADDING * 2 + PAGE_BORDER * 2,
          padding: PAGE_PADDING,
          borderRadius: 24,
          background: `${canvas}cc`,
          border: `${PAGE_BORDER}px solid ${border}`,
        }}
      >
        {art.map((src, pocket) =>
          src ? (
            <img
              key={pocket}
              src={src}
              width={POCKET.width}
              height={POCKET.height}
              alt=""
              style={{ borderRadius: 8 }}
            />
          ) : (
            <div
              key={pocket}
              style={{
                width: POCKET.width,
                height: POCKET.height,
                borderRadius: 8,
                background: surface,
                border: `2px solid ${border}`,
              }}
            />
          ),
        )}
      </div>
    </div>,
    SHARE_IMAGE_SIZE,
  );
}
