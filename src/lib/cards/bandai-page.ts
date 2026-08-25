/**
 * Reading the official Bandai card list.
 *
 * en.onepiece-cardgame.com publishes each set weeks before any API
 * carries it, and the founder — an official One Piece judge, with
 * Bandai's permission to collect from the site — wants new sets in the
 * catalogue the day they go up. The page is old-fashioned in the best
 * way: every card's full data is server-rendered into the HTML as a
 * modal block, so what a "scrape" really is here is reading a document.
 *
 * This module only PARSES. It never fetches — the collector script
 * (`npm run cards:scrape:bandai`) runs on a laptop and hands the HTML
 * in, the same division of labour every import follows: collection
 * happens on a machine somebody is watching, and the server is given
 * data. Keeping the parsing pure is also what lets the unit tests pin
 * the exact markup shapes it understands.
 *
 * Field identification is driven by the `<h3>` LABELS inside each card
 * block, not by Bandai's CSS class names. Labels are what a human
 * proof-reads against the printed card, so they are the slowest thing
 * on the page to change; class names are nobody's promise. When the
 * markup does drift, the collector's discover mode reports fill rates
 * per field, so a broken parse announces itself as "Power: 0 of 132"
 * instead of a silent set of blank cards.
 *
 * Alternate arts: the founder noted the site "doesn't list" them — what
 * it actually does is list them without SAYING so. A parallel printing
 * appears as its own block whose id and image carry a `_p1`/`_p2`
 * suffix while the printed card number stays the same. The suffix is a
 * fact off the page, so it is recorded as `parallel: 1`; whether that
 * parallel is a manga art or a special art is a human classification,
 * made afterwards in the admin console, never guessed here.
 */

/** One card block as the page states it. Null means the page said "-" or nothing. */
export interface BandaiCard {
  /** The block's own id, e.g. "OP09-001" or "OP09-001_p1". Names the image file. */
  slug: string;
  /** The printed identifier, shared by a base art and its parallels. */
  cardNumber: string;
  /** The `_pN` suffix when this block is a parallel printing, else null. */
  parallel: number | null;
  name: string;
  rarity: string | null;
  /** "Leader" | "Character" | "Event" | "Stage" | "DON!!" — title-cased. */
  cardType: string | null;
  cost: number | null;
  life: number | null;
  power: number | null;
  counter: number | null;
  /** Lowercased, split on the slash: "Red/Green" → ["red", "green"]. */
  colors: string[];
  attribute: string | null;
  /** The block's "Type" row: traits, split on the slash. */
  traits: string[];
  effectText: string | null;
  triggerText: string | null;
  /** The "Card Set(s)" row, verbatim. Provenance, not a set name. */
  setText: string | null;
  /** The card image, resolved absolute when a page URL is supplied. */
  imageUrl: string | null;
}

/* -------------------------------------------------------------------------- */
/* Text                                                                       */
/* -------------------------------------------------------------------------- */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  /* Card texts write powers as "−1000" and costs as "×2". */
  minus: "−",
  times: "×",
  plusmn: "±",
  hellip: "…",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => {
      return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
    });
}

/**
 * HTML to plain text: `<br>` becomes a newline, every other tag goes.
 *
 * Card effects use `<br>` for their line structure and the icons inside
 * an effect ("[On Play]" rendered as an image with alt text) degrade to
 * their surrounding text. Whitespace collapses per line so the markup's
 * own indentation does not end up inside an effect.
 */
export function htmlToText(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, index, lines) => line.length > 0 || lines[index - 1]?.length > 0)
    .join("\n")
    .trim();
}

/** "-", "—" and "" are the page's ways of saying "none". */
function meaningful(text: string): string | null {
  const value = text.trim();
  if (value.length === 0 || value === "-" || value === "—") return null;
  return value;
}

function asInteger(text: string | null): number | null {
  if (text === null) return null;
  const digits = text.replace(/[^\d-]/g, "");
  if (!/^-?\d+$/.test(digits)) return null;
  return Number(digits);
}

/* -------------------------------------------------------------------------- */
/* The card blocks                                                            */
/* -------------------------------------------------------------------------- */

/** The block id, split into printed number and parallel suffix. */
export function splitSlug(slug: string): {
  cardNumber: string;
  parallel: number | null;
} {
  const match = /^(.*?)_p(\d+)$/.exec(slug);
  if (match) return { cardNumber: match[1], parallel: Number(match[2]) };
  return { cardNumber: slug, parallel: null };
}

const CARD_CATEGORIES: Record<string, string> = {
  leader: "Leader",
  character: "Character",
  event: "Event",
  stage: "Stage",
  "don!!": "DON!!",
};

/** LEADER → Leader, matching the vocabulary the provider sync writes. */
function normalizeCategory(raw: string | null): string | null {
  if (raw === null) return null;
  const known = CARD_CATEGORIES[raw.toLowerCase()];
  if (known) return known;
  /* An unknown category is kept, readably, rather than dropped: a new
     card type is exactly the kind of thing Bandai ships first. */
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** Resolves an image src against the page it appeared on. */
function resolveImage(src: string | null, pageUrl: string | undefined): string | null {
  if (!src) return null;
  const clean = decodeEntities(src.trim());
  if (!pageUrl) return clean;
  try {
    return new URL(clean, pageUrl).toString();
  } catch {
    return clean;
  }
}

/**
 * One `<dl class="modalCol" id="…">` block into a card.
 *
 * Returns null when the block has no id or no name — a block like that
 * is furniture, not a card, and half a card in the manifest is worse
 * than a gap the discover report can point at.
 */
function parseBlock(
  attributes: string,
  body: string,
  pageUrl: string | undefined,
): BandaiCard | null {
  const slug = /id="([^"]+)"/.exec(attributes)?.[1]?.trim();
  if (!slug) return null;

  /*
   * The header row: `<span>OP09-001</span> | <span>SR</span> |
   * <span>CHARACTER</span>`. The printed number in the first span is
   * preferred over the slug for the card's identity, because the slug
   * carries the parallel suffix and the span is what is on the card.
   */
  const info = /<div[^>]*class="[^"]*infoCol[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(body);
  const spans = info
    ? [...info[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((m) =>
        htmlToText(m[1]),
      )
    : [];

  const name = htmlToText(
    /<div[^>]*class="[^"]*cardName[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(body)?.[1] ?? "",
  );
  if (!name) return null;

  const fromSlug = splitSlug(slug);
  const cardNumber = (spans[0] && meaningful(spans[0])) || fromSlug.cardNumber;

  /*
   * The image. Lazy-loaded pages put the real source in `data-src` and a
   * placeholder in `src`, so `data-src` wins when both exist.
   */
  const imgTag = /<img[^>]*>/.exec(body)?.[0] ?? "";
  const src =
    /data-src="([^"]+)"/.exec(imgTag)?.[1] ?? /src="([^"]+)"/.exec(imgTag)?.[1] ?? null;

  /*
   * Every labelled value in the block: `<h3>Power</h3>5000`. Labels are
   * the contract; the class names around them are not. A label appearing
   * twice keeps its first value.
   */
  const fields = new Map<string, string>();
  for (const match of body.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)<\/div>/g)) {
    const label = htmlToText(match[1]).toLowerCase();
    if (label && !fields.has(label)) fields.set(label, htmlToText(match[2]));
  }

  const field = (label: string): string | null => meaningful(fields.get(label) ?? "");

  const colors = (field("color") ?? "")
    .split("/")
    .map((color) => color.trim().toLowerCase())
    .filter((color) => color.length > 0);

  const traits = (field("type") ?? "")
    .split("/")
    .map((trait) => trait.trim())
    .filter((trait) => trait.length > 0);

  return {
    slug,
    cardNumber,
    parallel: fromSlug.parallel,
    name,
    rarity: spans[1] ? meaningful(spans[1]) : null,
    cardType: normalizeCategory(spans[2] ? meaningful(spans[2]) : null),
    /* Leaders print Life where others print Cost; the labels say which. */
    cost: asInteger(field("cost")),
    life: asInteger(field("life")),
    power: asInteger(field("power")),
    counter: asInteger(field("counter")),
    colors,
    attribute: field("attribute"),
    traits,
    effectText: field("effect"),
    triggerText: field("trigger"),
    setText: field("card set(s)"),
    imageUrl: resolveImage(src, pageUrl),
  };
}

/**
 * Every card on a cardlist page, in page order, parallels included.
 *
 * `pageUrl` resolves relative image paths; omit it (fixtures do) and
 * the paths come back as written.
 */
export function parseBandaiCardlist(html: string, pageUrl?: string): BandaiCard[] {
  const cards: BandaiCard[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(
    /<dl\b([^>]*class="[^"]*modalCol[^"]*"[^>]*)>([\s\S]*?)<\/dl>/g,
  )) {
    const card = parseBlock(match[1], match[2], pageUrl);
    if (card && !seen.has(card.slug)) {
      seen.add(card.slug);
      cards.push(card);
    }
  }

  return cards;
}

/**
 * The series title the page itself displays, e.g. from the cardlist's
 * series selector. A suggestion for the set name, never the authority —
 * the collector prints it and the flag overrides it.
 */
export function parseSeriesTitle(html: string): string | null {
  const selected = /<option[^>]*\bselected\b[^>]*>([\s\S]*?)<\/option>/.exec(html);
  if (selected) {
    const title = htmlToText(selected[1]);
    if (title) return title;
  }
  return null;
}

/**
 * The set code the card numbers imply, in the provider's own shape:
 * "OP09-001" → "OP-09", which is how the API writes set ids, so an
 * imported set reads the same as a synced one in every label.
 */
export function impliedSetCode(cards: readonly BandaiCard[]): string | null {
  const counts = new Map<string, number>();

  for (const card of cards) {
    const prefix = card.cardNumber.split("-")[0];
    if (prefix) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }

  const commonest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!commonest) return null;

  const match = /^([A-Z]+)(\d+)$/.exec(commonest);
  return match ? `${match[1]}-${match[2]}` : commonest;
}

/**
 * What a parallel printing is called until a human classifies it.
 *
 * "Alternate Art", numbered past the first — the words the provider
 * sync uses, letter for letter, so an imported chip reads exactly like
 * a synced one ("OP-14 · SR · Alternate Art"). Whether a parallel is
 * really the Manga or SP rarity is decided by eyes on the picture, in
 * the admin console's review screen; the page does not say and this
 * does not guess.
 */
export function parallelLabel(parallel: number): string {
  return parallel > 1 ? `Alternate Art ${parallel}` : "Alternate Art";
}

/** The image file name the collector saves a card under. */
export function imageFileName(card: BandaiCard): string {
  const extension =
    /\.(png|jpe?g|webp)(?:\?|$)/i.exec(card.imageUrl ?? "")?.[1]?.toLowerCase() ??
    "png";
  return `${card.slug}.${extension === "jpeg" ? "jpg" : extension}`;
}

/**
 * The parsed page as an import manifest, base printings first.
 *
 * Base-first ordering matters: the importer builds each card's gameplay
 * row from the first entry carrying that number, and on the page a
 * parallel sometimes states less than its base does.
 */
export function toImportManifest(
  cards: readonly BandaiCard[],
  set: { setCode: string; setName: string },
) {
  const ordered = [...cards].sort((a, b) => {
    if (a.cardNumber !== b.cardNumber) return a.cardNumber < b.cardNumber ? -1 : 1;
    return (a.parallel ?? 0) - (b.parallel ?? 0);
  });

  return {
    provider: "bandai" as const,
    setCode: set.setCode,
    setName: set.setName,
    cards: ordered.map((card) => ({
      cardNumber: card.cardNumber,
      name: card.name,
      file: imageFileName(card),
      ...(card.imageUrl ? { sourceUrl: card.imageUrl } : {}),
      ...(card.parallel !== null
        ? { printingLabel: parallelLabel(card.parallel), parallel: card.parallel }
        : {}),
      ...(card.rarity ? { rarity: card.rarity } : {}),
      ...(card.cardType ? { cardType: card.cardType } : {}),
      ...(card.colors.length > 0 ? { colors: card.colors } : {}),
      ...(card.cost !== null ? { cost: card.cost } : {}),
      ...(card.life !== null ? { life: card.life } : {}),
      ...(card.power !== null ? { power: card.power } : {}),
      ...(card.counter !== null ? { counter: card.counter } : {}),
      ...(card.attribute ? { attribute: card.attribute } : {}),
      ...(card.traits.length > 0 ? { traits: card.traits } : {}),
      ...(card.effectText ? { effectText: card.effectText } : {}),
      ...(card.triggerText ? { triggerText: card.triggerText } : {}),
    })),
  };
}

/**
 * Fill rates per field, for the collector's discover mode.
 *
 * The parser's honesty report: when Bandai renames a label, the broken
 * field shows up here as "0 of 132" before anything is downloaded or
 * imported, which is the whole reason discover exists.
 */
export function discoverReport(cards: readonly BandaiCard[]): string[] {
  const total = cards.length;
  const count = (has: (card: BandaiCard) => boolean) => cards.filter(has).length;

  const line = (label: string, filled: number) =>
    `  ${label.padEnd(12)} ${filled} of ${total}`;

  return [
    `${total} card blocks`,
    line(
      "name",
      count((c) => c.name.length > 0),
    ),
    line(
      "rarity",
      count((c) => c.rarity !== null),
    ),
    line(
      "category",
      count((c) => c.cardType !== null),
    ),
    line(
      "cost",
      count((c) => c.cost !== null),
    ),
    line(
      "life",
      count((c) => c.life !== null),
    ),
    line(
      "power",
      count((c) => c.power !== null),
    ),
    line(
      "counter",
      count((c) => c.counter !== null),
    ),
    line(
      "color",
      count((c) => c.colors.length > 0),
    ),
    line(
      "attribute",
      count((c) => c.attribute !== null),
    ),
    line(
      "traits",
      count((c) => c.traits.length > 0),
    ),
    line(
      "effect",
      count((c) => c.effectText !== null),
    ),
    line(
      "trigger",
      count((c) => c.triggerText !== null),
    ),
    line(
      "image",
      count((c) => c.imageUrl !== null),
    ),
    line(
      "parallels",
      count((c) => c.parallel !== null),
    ),
  ];
}
