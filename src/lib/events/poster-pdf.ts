import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

import { SITE } from "@/lib/site";
import { joinUrl } from "./qr";
import type { PosterKind } from "@/components/events/join-poster";

/**
 * The counter sheet as a real one-page PDF.
 *
 * The HTML poster prints perfectly from a desktop browser, but a phone does
 * not cooperate: iOS Safari stamps its own URL, date and page count onto
 * every printout and adds margins that push the card onto a second page,
 * and no CSS can talk it out of either. A PDF ends the argument — it is one
 * page because this module says so, and there is no browser furniture
 * because there is no browser.
 *
 * Same trading-card anatomy as the HTML sheet (name bar, QR art window,
 * type line, rules text, collector line), same rules: black-on-white so it
 * survives a mono printer, the accent green as decoration only, the typed
 * code as prominent as the QR, and generic card anatomy that copies no
 * game's trade dress. If the design of one changes, change the other —
 * `tests/unit/poster-pdf.test.ts` keeps the load-bearing parts honest.
 */

/* ---- Geometry, in points (72/inch). Letter: 612 × 792. ------------------- */

const PAGE = { width: 612, height: 792 };
const MM = 72 / 25.4;

/** The card's printed width, identical to the HTML sheet's 170mm. */
const CARD_WIDTH = 170 * MM;

/** The card's black outer edge, like a real card's border. */
const EDGE = 3 * MM;

/** Padding inside the white frame. */
const PAD = 4 * MM;

const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const ACCENT = rgb(0xa6 / 255, 0xcc / 255, 0x2e / 255);
const ACCENT_WASH = rgb(0xee / 255, 0xf7 / 255, 0xd4 / 255);
const PANEL = rgb(0.98, 0.98, 0.98);
const RULE = rgb(0.82, 0.82, 0.82);
const GREY_TEXT = rgb(0.42, 0.42, 0.42);
const DARK_TEXT = rgb(0.15, 0.15, 0.15);
/** The brand backdrop the mark sits on, same as BRAND.md's favicons. */
const MARK_BACKDROP = rgb(0x12 / 255, 0x15 / 255, 0x1b / 255);

const TYPE_LINE: Record<PosterKind, string> = {
  event: "EVENT ROOM",
  counter: "TRADE ANYTIME",
  show: "CARD SHOW",
};

const STEPS = ["Scan the code", "Enter your name", "Post the cards you need"];
const GAME = "One Piece Card Game";

export interface PosterInput {
  title: string;
  subtitle?: string | null;
  kind: PosterKind;
  joinCode: string;
}

/** A rounded rectangle via an SVG path — pdf-lib rectangles have no radius. */
function roundedRect(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  opts: {
    color?: ReturnType<typeof rgb>;
    borderColor?: ReturnType<typeof rgb>;
    borderWidth?: number;
  },
) {
  const d =
    `M ${r},0 H ${w - r} A ${r} ${r} 0 0 1 ${w},${r} V ${h - r} ` +
    `A ${r} ${r} 0 0 1 ${w - r},${h} H ${r} A ${r} ${r} 0 0 1 0,${h - r} ` +
    `V ${r} A ${r} ${r} 0 0 1 ${r},0 Z`;
  // drawSvgPath's y axis points down from the given origin.
  page.drawSvgPath(d, { x, y: y + h, ...opts });
}

function centred(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  y: number,
  color = BLACK,
) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE.width - width) / 2, y, size, font, color });
}

/** Letter-spaced text, since pdf-lib has no tracking of its own. */
function tracked(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  y: number,
  gap: number,
  color = BLACK,
) {
  let cursor = x;
  for (const char of text) {
    page.drawText(char, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(char, size) + gap;
  }
}

function trackedWidth(text: string, font: PDFFont, size: number, gap: number): number {
  let width = 0;
  for (const char of text) width += font.widthOfTextAtSize(char, size) + gap;
  return width - gap;
}

/**
 * Builds the one-page poster PDF. Always exactly one page: everything is
 * placed at fixed coordinates on a Letter sheet, so no printer, browser or
 * paper tray can paginate it.
 */
export async function posterPdf(input: PosterInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${input.title} · ${SITE.name}`);

  const page = doc.addPage([PAGE.width, PAGE.height]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.CourierBold);

  /*
   * The approved mark, byte for byte from public/brand. Embedded, never
   * redrawn — BRAND.md. process.cwd() so Next's file tracing carries the
   * asset into the deployed function.
   */
  const markBytes = await readFile(
    path.join(process.cwd(), "public", "brand", "cardflare-mark.png"),
  );
  const markImage = await doc.embedPng(markBytes);

  const cardX = (PAGE.width - CARD_WIDTH) / 2;
  const innerW = CARD_WIDTH - EDGE * 2;
  const frameW = innerW - PAD * 2;

  /* The card is laid out top-down; `cursor` is the next block's top edge. */
  const cardTop = PAGE.height - 14 * MM;

  /* ---- Outer black card edge, drawn after we know the height ------------ */
  /* Heights of each block, computed first so the card hugs its content.    */

  const nameBarH = input.subtitle ? 15 * MM : 12 * MM;
  const qrBoxH = frameW; // square art window
  const typeLineH = 8 * MM;
  const stepH = 6.2 * MM;
  const rulesH = 12 * MM + STEPS.length * stepH + 22 * MM;
  const collectorH = 6 * MM;
  const gap = 3 * MM;

  const innerH =
    PAD +
    nameBarH +
    gap +
    qrBoxH +
    gap +
    typeLineH +
    gap +
    rulesH +
    gap +
    collectorH +
    PAD;
  const cardH = innerH + EDGE * 2;
  const cardY = cardTop - cardH;

  roundedRect(page, cardX, cardY, CARD_WIDTH, cardH, 12, { color: BLACK });
  roundedRect(page, cardX + EDGE, cardY + EDGE, innerW, innerH, 7, {
    color: WHITE,
    borderColor: RULE,
    borderWidth: 0.8,
  });

  const left = cardX + EDGE + PAD;
  let top = cardY + EDGE + innerH - PAD;

  /* ---- Name bar ---------------------------------------------------------- */
  {
    const titleSize = 19;
    let title = input.title;
    // The lockup needs its corner; a marathon name is trimmed, not wrapped.
    const maxTitleWidth = frameW - 34 * MM;
    while (
      bold.widthOfTextAtSize(title, titleSize) > maxTitleWidth &&
      title.length > 1
    ) {
      title = `${title.slice(0, -2)}…`;
    }
    page.drawText(title, { x: left, y: top - 7 * MM, size: titleSize, font: bold });

    if (input.subtitle) {
      page.drawText(input.subtitle, {
        x: left,
        y: top - 11.5 * MM,
        size: 8,
        font: helv,
        color: GREY_TEXT,
      });
    }

    // Brand lockup, right-aligned: the mark on its backdrop, wordmark beside.
    const markH = 7 * MM;
    const markW = markH * (markImage.width / markImage.height);
    const wordSize = 10.5;
    const wordW = bold.widthOfTextAtSize(SITE.name, wordSize);
    const chipW = markW + 2.4 * MM;
    const chipH = markH + 1.8 * MM;
    const lockupX = left + frameW - wordW - 2 * MM - chipW;
    const chipY = top - 2 * MM - chipH;

    roundedRect(page, lockupX, chipY, chipW, chipH, 4, { color: MARK_BACKDROP });
    page.drawImage(markImage, {
      x: lockupX + 1.2 * MM,
      y: chipY + 0.9 * MM,
      width: markW,
      height: markH,
    });
    page.drawText(SITE.name, {
      x: lockupX + chipW + 2 * MM,
      y: chipY + chipH / 2 - wordSize / 2 + 1,
      size: wordSize,
      font: bold,
    });

    // The rule under the name bar, like a card's title box edge.
    page.drawRectangle({
      x: left,
      y: top - nameBarH,
      width: frameW,
      height: 1.6,
      color: BLACK,
    });
    top -= nameBarH + gap;
  }

  /* ---- Art window: the QR ------------------------------------------------ */
  {
    const boxY = top - qrBoxH;
    roundedRect(page, left, boxY, frameW, qrBoxH, 5, {
      color: WHITE,
      borderColor: BLACK,
      borderWidth: 1.8,
    });

    // Accent corner ticks. Decoration only — nothing readable depends on them.
    const tick = 5 * MM;
    const tw = 3;
    for (const [tx, ty, horiz, vert] of [
      [left, top, 1, -1],
      [left + frameW, top, -1, -1],
      [left, boxY, 1, 1],
      [left + frameW, boxY, -1, 1],
    ] as const) {
      page.drawRectangle({
        x: horiz === 1 ? tx : tx - tick,
        y: ty - (vert === -1 ? tw : 0),
        width: tick,
        height: tw,
        color: ACCENT,
      });
      page.drawRectangle({
        x: tx - (horiz === -1 ? tw : 0),
        y: vert === 1 ? ty : ty - tick,
        width: tw,
        height: tick,
        color: ACCENT,
      });
    }

    /*
     * The QR itself, drawn module by module from the same generator and
     * error-correction level as the on-screen SVG. Vector rectangles, so it
     * stays razor sharp at any print size.
     */
    const qr = QRCode.create(joinUrl(input.joinCode), { errorCorrectionLevel: "Q" });
    const modules = qr.modules.size;
    // ~4 modules of quiet zone inside the window, per the QR spec.
    const quiet = 8 * MM;
    const qrSize = qrBoxH - quiet * 2;
    const cell = qrSize / modules;
    const qrX = left + (frameW - qrSize) / 2;
    const qrTop = top - quiet;

    for (let row = 0; row < modules; row += 1) {
      for (let col = 0; col < modules; col += 1) {
        if (!qr.modules.get(row, col)) continue;
        page.drawRectangle({
          x: qrX + col * cell,
          y: qrTop - (row + 1) * cell,
          // A hair of overlap so adjacent modules fuse without seams.
          width: cell + 0.15,
          height: cell + 0.15,
          color: BLACK,
        });
      }
    }

    top = boxY - gap;
  }

  /* ---- Type line --------------------------------------------------------- */
  {
    const chipY = top - typeLineH;
    roundedRect(page, left, chipY, frameW, typeLineH, 3, {
      color: ACCENT_WASH,
      borderColor: RULE,
      borderWidth: 0.8,
    });
    const textY = chipY + typeLineH / 2 - 3;
    tracked(page, TYPE_LINE[input.kind], bold, 8, left + 3 * MM, textY, 0.8);
    const gameW = helv.widthOfTextAtSize(GAME, 8);
    page.drawText(GAME, {
      x: left + frameW - 3 * MM - gameW,
      y: textY,
      size: 8,
      font: helv,
      color: DARK_TEXT,
    });
    top = chipY - gap;
  }

  /* ---- Rules text -------------------------------------------------------- */
  {
    const panelY = top - rulesH;
    roundedRect(page, left, panelY, frameW, rulesH, 3, {
      color: PANEL,
      borderColor: rgb(0.9, 0.9, 0.9),
      borderWidth: 0.8,
    });

    let lineY = top - 8 * MM;
    centred(page, "Scan to find cards from people in this room", bold, 12, lineY);

    lineY -= 4 * MM;
    // Steps, left-aligned as a block but centred as a group.
    const stepSize = 10;
    const widest = Math.max(
      ...STEPS.map((step) => helv.widthOfTextAtSize(step, stepSize)),
    );
    const blockX = (PAGE.width - (widest + 7 * MM)) / 2;
    for (const [index, step] of STEPS.entries()) {
      lineY -= stepH;
      const badge = 2.2 * MM;
      page.drawCircle({
        x: blockX + badge,
        y: lineY + stepSize / 3,
        size: badge,
        color: BLACK,
      });
      const numeral = String(index + 1);
      const numeralW = bold.widthOfTextAtSize(numeral, 7);
      page.drawText(numeral, {
        x: blockX + badge - numeralW / 2,
        y: lineY + stepSize / 3 - 2.4,
        size: 7,
        font: bold,
        color: WHITE,
      });
      page.drawText(step, {
        x: blockX + badge * 2 + 2 * MM,
        y: lineY,
        size: stepSize,
        font: helv,
        color: DARK_TEXT,
      });
    }

    // Dashed rule, then the typed route in.
    lineY -= 4.5 * MM;
    for (let x = left + 6 * MM; x < left + frameW - 6 * MM; x += 4) {
      page.drawRectangle({ x, y: lineY, width: 2, height: 0.7, color: RULE });
    }

    lineY -= 4.5 * MM;
    centred(
      page,
      `No camera? Go to ${SITE.domain}/join and enter`,
      helv,
      8,
      lineY,
      GREY_TEXT,
    );

    lineY -= 8.5 * MM;
    const codeSize = 26;
    const codeGap = 4;
    const codeW = trackedWidth(input.joinCode, mono, codeSize, codeGap);
    tracked(
      page,
      input.joinCode,
      mono,
      codeSize,
      (PAGE.width - codeW) / 2,
      lineY,
      codeGap,
    );

    top = panelY - gap;
  }

  /* ---- Collector line ---------------------------------------------------- */
  {
    const y = top - 4 * MM;
    tracked(page, input.joinCode, mono, 7, left, y, 0.6, GREY_TEXT);
    const domain = SITE.domain.toUpperCase();
    const domainW = trackedWidth(domain, helv, 7, 0.9);
    tracked(page, domain, helv, 7, left + frameW - domainW, y, 0.9, GREY_TEXT);
  }

  return doc.save();
}
