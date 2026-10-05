import { ImageResponse } from "next/og";
import { z } from "zod";

import { binderOwner, readBinder } from "@/lib/binder/binder";
import { isRenderableImageUrl } from "@/lib/cards/images";
import { SITE } from "@/lib/site";

export const alt = "A trade binder on cardflare";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/*
 * Colours duplicated from the design tokens because Satori resolves no
 * CSS variables; the same list as src/app/opengraph-image.tsx.
 */
const COLOR = {
  canvas: "#0e1116",
  surface: "#151a21",
  border: "#2a323d",
  accent: "#c6ee4f",
  textPrimary: "#f2f5f7",
  textSecondary: "#b3becc",
};

/**
 * The picture a shared binder link unfurls with: the name and owner on
 * the left, the first cards fanned on the right like a page of pockets.
 * A private or missing binder gets the plain card, never its contents.
 */
export default async function BinderImage({
  params,
}: {
  params: Promise<{ binderId: string }>;
}) {
  const id = z.guid().safeParse((await params).binderId);
  const owner = id.success ? await binderOwner(id.data) : null;
  const binder = owner && id.success ? await readBinder(owner, null, id.data) : null;

  const art = (binder?.cards ?? [])
    .map((card) => card.imageUrl)
    .filter((url): url is string => Boolean(url && isRenderableImageUrl(url)))
    .slice(0, 6);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: COLOR.canvas,
        backgroundImage: `radial-gradient(900px 420px at 20% -10%, rgba(198,238,79,0.16), transparent 70%)`,
        padding: 64,
        gap: 48,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 470,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 4,
              color: COLOR.accent,
            }}
          >
            TRADE BINDER
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.05,
              color: COLOR.textPrimary,
            }}
          >
            {binder ? binder.name : "A binder"}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: COLOR.textSecondary }}>
            {binder
              ? `${binder.ownerName} · ${binder.count} ${binder.count === 1 ? "card" : "cards"}`
              : SITE.name}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 32,
            fontWeight: 800,
            color: COLOR.accent,
          }}
        >
          {SITE.name}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          width: 560,
          alignContent: "center",
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((slot) =>
          art[slot] ? (
            <img
              key={slot}
              src={art[slot]}
              alt=""
              width={170}
              height={238}
              style={{ borderRadius: 10, border: `2px solid ${COLOR.border}` }}
            />
          ) : (
            <div
              key={slot}
              style={{
                width: 170,
                height: 238,
                borderRadius: 10,
                border: `2px dashed ${COLOR.border}`,
                background: COLOR.surface,
              }}
            />
          ),
        )}
      </div>
    </div>,
    size,
  );
}
