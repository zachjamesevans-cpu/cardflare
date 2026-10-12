import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { SITE } from "@/lib/site";

export const alt = `${SITE.name}: ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Social sharing card, generated at build time.
 *
 * Colours are duplicated from the design tokens because Satori resolves no CSS
 * variables — keep this list in sync with the `@theme` block in globals.css.
 */
const COLOR = {
  /* The CF logo's own ground, the "soft" look's surface (2026-10-11). */
  canvas: "#111710",
  surface: "#111710",
  border: "#242d22",
  accent: "#cefc84",
  textPrimary: "#f2f5f7",
  textSecondary: "#bcc4b8",
};

/**
 * Reads a PNG's dimensions from its IHDR chunk, which always sits at a fixed
 * offset. Cheaper than a dependency for the one thing this file needs.
 */
function pngSize(buffer: Buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export default async function OpengraphImage() {
  /* The founder's flat "cardflare" wordmark in the logo's green, the one
     the site header and the app's Feed wear, in place of the lime card
     mark and the name typed beside it. */
  const markPath = join(process.cwd(), "public/brand/cardflare-wordmark-soft.png");
  const mark = await readFile(markPath);

  // Derive the width from the file so the card never stretches it.
  const { width: markWidth, height: markHeight } = pngSize(mark);
  const MARK_HEIGHT = 52;
  const markRenderWidth = Math.round(MARK_HEIGHT * (markWidth / markHeight));

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: COLOR.canvas,
        backgroundImage: `radial-gradient(900px 420px at 50% -20%, rgba(206,252,132,0.14), transparent 70%)`,
        padding: 72,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <img
          src={`data:image/png;base64,${mark.toString("base64")}`}
          width={markRenderWidth}
          height={MARK_HEIGHT}
          alt=""
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 82,
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: -2,
          }}
        >
          <span style={{ color: COLOR.textPrimary }}>Find the card.</span>
          <span style={{ color: COLOR.accent }}>Make the trade.</span>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 30,
            color: COLOR.textSecondary,
            maxWidth: 900,
            lineHeight: 1.4,
          }}
        >
          Find cards, match with nearby traders, and trade in person at local TCG
          events.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          borderTop: `1px solid ${COLOR.border}`,
          paddingTop: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: COLOR.surface,
            border: `1px solid ${COLOR.border}`,
            borderRadius: 999,
            padding: "10px 22px",
            fontSize: 24,
            color: COLOR.accent,
          }}
        >
          {SITE.domain}
        </div>
      </div>
    </div>,
    size,
  );
}
