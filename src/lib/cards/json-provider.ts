import { readFile } from "node:fs/promises";

import { parseProvidedCards, type CardProvider, type ProvidedCard } from "./provider";

/**
 * Reads cards from a JSON file on disk.
 *
 * The first provider on purpose. Whatever the eventual source — an official
 * API, a community dataset, a spreadsheet export — it can be turned into this
 * file's shape without CardFlare taking a runtime dependency on it, and the
 * import stays reproducible and reviewable.
 *
 * `images` is false because nothing has granted permission to distribute
 * artwork. A provider that has may set it true, and `image_url` starts
 * populating with no other change.
 */
export class JsonCardProvider implements CardProvider {
  readonly name: string;
  readonly capabilities = { images: false };

  constructor(private readonly filePath: string) {
    this.name = `json:${filePath}`;
  }

  async fetchCards(): Promise<ProvidedCard[]> {
    const contents = await readFile(this.filePath, "utf8");

    let raw: unknown;
    try {
      raw = JSON.parse(contents);
    } catch (error) {
      throw new Error(`${this.filePath} is not valid JSON`, { cause: error });
    }

    const parsed = parseProvidedCards(raw);

    if (!parsed.ok) {
      // Every failing record, not just the first — an import of thousands
      // should tell you everything to fix in one pass.
      throw new Error(
        `${parsed.errors.length} card(s) failed validation:\n  ${parsed.errors.join("\n  ")}`,
      );
    }

    return parsed.cards;
  }
}
