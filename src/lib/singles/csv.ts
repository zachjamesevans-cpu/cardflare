/**
 * Parsing a store's own TCGplayer Pro inventory export.
 *
 * Kept free of server-only imports so it stays unit-testable, same as the
 * waitlist's form-data module. Everything here is pure: text in, rows out.
 *
 * Two commitments this module makes:
 *
 * - **Prices are dropped at the door.** The export carries several price
 *   columns; nothing here reads them, and the output shape has nowhere to
 *   put one. PRODUCT.md: CardFlare shows no prices, so it stores none.
 * - **Nothing is guessed.** A row without a recognisable card number or a
 *   positive quantity is reported as skipped, with its line number and a
 *   reason, rather than silently dropped or fuzzily matched. The store sees
 *   an honest count of what did not make it in.
 *
 * Built against the documented shape of TCGplayer's inventory export
 * (Product Line / Set Name / Product Name / Number / Total Quantity plus
 * price columns). The header mapping is alias-based so the day a real
 * pilot store's file shows a variant header, the fix is one alias.
 */

/** Reject anything bigger before reading it; no inventory file is this big. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Data rows a file may carry; far above any real store's distinct lines. */
export const MAX_LINES = 50_000;

export type SkipReason = "no-number" | "no-quantity" | "zero-quantity" | "other-game";

export interface SinglesLine {
  /** 1-based line number in the file, for honest reporting. */
  line: number;
  /** The card number, compacted the way the catalog indexes it (OP01013). */
  compactNumber: string;
  /** The product name, for showing unmatched lines back to a human. */
  name: string;
  quantity: number;
}

export interface SkippedLine {
  line: number;
  reason: SkipReason;
  /** Whatever identified the row best, for the store to recognise it. */
  label: string;
}

export type ParsedSingles =
  | {
      ok: true;
      /** Data rows in the file, headers and blank lines excluded. */
      linesSeen: number;
      lines: SinglesLine[];
      skipped: SkippedLine[];
    }
  | { ok: false; problem: "empty" | "no-header" | "too-many-lines" };

/* -------------------------------------------------------------------------- */
/* CSV mechanics                                                              */
/* -------------------------------------------------------------------------- */

/**
 * RFC 4180 parsing: quoted fields, doubled quotes, commas and newlines
 * inside quotes, CRLF or LF. Card names contain commas ("Nami, Cat
 * Burglar"), so a split-on-comma would corrupt exactly the rows that
 * matter.
 */
export function parseCsv(text: string): string[][] {
  // A UTF-8 BOM in front of the first header is common in Windows exports.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Header mapping                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Column aliases, matched case-insensitively after trimming.
 *
 * "Add to Quantity" is deliberately absent from the quantity aliases: in
 * TCGplayer's export it is a *delta* column for bulk updates, and reading
 * it as stock would double-count or invent inventory.
 */
const HEADERS = {
  number: ["number", "card number", "no."],
  name: ["product name", "name", "card name"],
  quantity: ["total quantity", "quantity", "qty"],
  productLine: ["product line", "game"],
} as const;

function findColumn(header: string[], aliases: readonly string[]): number {
  const cleaned = header.map((cell) => cell.trim().toLowerCase());
  for (const alias of aliases) {
    const index = cleaned.indexOf(alias);
    if (index !== -1) return index;
  }
  return -1;
}

/** Compacts a number the way the catalog does: uppercase, alphanumerics. */
export function compactNumber(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** One Piece product lines as TCGplayer names them. */
const ONE_PIECE_LINE = /one\s*piece/i;

/* -------------------------------------------------------------------------- */
/* The parse                                                                  */
/* -------------------------------------------------------------------------- */

export function parseSinglesExport(text: string): ParsedSingles {
  const rows = parseCsv(text).filter((row) =>
    row.some((cell) => cell.trim().length > 0),
  );

  if (rows.length === 0) return { ok: false, problem: "empty" };

  const header = rows[0];
  const numberCol = findColumn(header, HEADERS.number);
  const nameCol = findColumn(header, HEADERS.name);
  const quantityCol = findColumn(header, HEADERS.quantity);
  const lineCol = findColumn(header, HEADERS.productLine);

  /*
   * A file is only readable if it names a quantity column and at least one
   * way to identify the card. Anything less is not an inventory export.
   */
  if (quantityCol === -1 || numberCol === -1) {
    return { ok: false, problem: "no-header" };
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_LINES) return { ok: false, problem: "too-many-lines" };

  const lines: SinglesLine[] = [];
  const skipped: SkippedLine[] = [];

  dataRows.forEach((row, index) => {
    // +2: 1-based, plus the header line.
    const line = index + 2;
    const name = (nameCol === -1 ? "" : (row[nameCol] ?? "")).trim();
    const rawNumber = (row[numberCol] ?? "").trim();
    const label = name || rawNumber || `line ${line}`;

    /*
     * Stores sell more games than One Piece, and their export carries all
     * of them. Other product lines are ignored on purpose — not a failure,
     * just not ours yet.
     */
    if (lineCol !== -1) {
      const productLine = (row[lineCol] ?? "").trim();
      if (productLine && !ONE_PIECE_LINE.test(productLine)) {
        skipped.push({ line, reason: "other-game", label });
        return;
      }
    }

    const number = compactNumber(rawNumber);
    if (!number || !/[0-9]/.test(number)) {
      skipped.push({ line, reason: "no-number", label });
      return;
    }

    const rawQuantity = (row[quantityCol] ?? "").trim();
    const quantity = Number.parseInt(rawQuantity, 10);
    if (!Number.isFinite(quantity) || Number.isNaN(quantity) || rawQuantity === "") {
      skipped.push({ line, reason: "no-quantity", label });
      return;
    }

    /*
     * The export includes rows the store has listed but sold out of.
     * Zero is information ("we know this card, none in stock"), so it is
     * skipped as intentional rather than counted as a failure.
     */
    if (quantity <= 0) {
      skipped.push({ line, reason: "zero-quantity", label });
      return;
    }

    lines.push({ line, compactNumber: number, name, quantity });
  });

  return { ok: true, linesSeen: dataRows.length, lines, skipped };
}

/**
 * Collapses per-listing rows into one quantity per card number.
 *
 * The export lists the same card once per condition and printing; the room
 * only ever asks "does the counter have this card", so quantities sum and
 * the row count stays bounded by the catalog.
 */
export function aggregateByNumber(lines: SinglesLine[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(
      line.compactNumber,
      (totals.get(line.compactNumber) ?? 0) + line.quantity,
    );
  }
  return totals;
}
