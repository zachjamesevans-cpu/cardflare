import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { SITE } from "@/lib/site";

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Social sharing card, generated at build time.
 *
 * Colours are duplicated from the design tokens because Satori resolves no CSS
 * variables — keep this list in sync with the `@theme` block in globals.css.
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
 * Reads a PNG's dimensions from its IHDR chunk, which always sits at a fixed
 * offset. Cheaper than a dependency for the one thing this file needs.
 */
function pngSize(buffer: Buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export default async function OpengraphImage() {
  const markPath = join(process.cwd(), "public/brand/cardflare-mark.png");
  const mark = await readFile(markPath);

  // The mark is taller than it is wide. Derive the width from the file so the
  // card never stretches it, whatever proportions a future master has.
  const { width: markWidth, height: markHeight } = pngSize(mark);
  const MARK_HEIGHT = 76;
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
        backgroundImage: `radial-gradient(900px 420px at 50% -20%, rgba(198,238,79,0.14), transparent 70%)`,
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
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>
          <span style={{ color: COLOR.textPrimary }}>Card</span>
          <span style={{ color: COLOR.accent }}>Flare</span>
        </div>
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
