# CardFlare — Card data

How card data reaches CardFlare, what it looks like, and what it does not
cover.

## Source: Scrydex

Every game's catalogue comes from [Scrydex](https://scrydex.com/docs), one
adapter for all of them: `src/lib/cards/providers/scrydex/adapter.ts`
(`ScrydexProvider`). `src/lib/cards/providers/registry.ts` maps each game to
it. The catalogues used before 2026-11-25 (OPTCG API, Scryfall, TCGdex,
FaB Cube, Riftcodex, Lorcast) are gone, and production holds only Scrydex
cards.

| Game      | Scrydex path        |
| --------- | ------------------- |
| One Piece | `onepiece`          |
| Pokémon   | `pokemon`           |
| Magic     | `magicthegathering` |
| Lorcana   | `lorcana`           |
| Riftbound | `riftbound`         |
| Gundam    | `gundam`            |

**Flesh and Blood is not carried** by Scrydex, so it has no catalogue.

- **Auth.** Two headers on every request, from `SCRYDEX_API_KEY` (`x-api-key`)
  and `SCRYDEX_TEAM_ID` (`x-team-id`). Both must be set; a missing one is named
  before any request is sent. Each API request costs one credit; images cost
  none.
- **Scope.** English, paper sets only. Sets marked `is_online_only` (the
  Pokémon TCG Pocket sets) and any non-English set or card are skipped.
- **A card is a Scrydex card id** (`OP18-022`, `KTK-214`, `RAD-1`), which is
  unique within a game and becomes `canonical_card_number`.
- **A printing is a Scrydex variant** (`normal`, `foil`, `altArt`, ...), keyed
  `<card id>:<variant>`, with the variant's own image when it has one. An alt
  art is a printing of its card, never a second card. The label reads
  `<SET> · <rarity> · <Variant>`, leaving out plain variants.
- **Not stored:** prices, rulings, legalities, marketplace links and
  population reports are dropped from `raw_metadata`.

## Importing

```bash
# one set
npm run cards:import -- --game <game> --set <CODE>

# every set of a game, newest first
npm run cards:import -- --game <game> --all --confirm
```

`<game>` is one of `one-piece`, `pokemon`, `mtg`, `lorcana`, `riftbound`,
`gundam`. `--from <CODE>` resumes a stopped `--all` run. Needs
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the two Scrydex
variables; reads `.env.local`. This is the reference way to import a whole
game: it has no time limit.

**Admin → Card catalog** runs the same `syncCards` call on the deployed
server: a One Piece sample (the newest set, up to 40 cards) or full sync, and
a per-game, per-set import below it.

- Gated by the admin check inside the Server Action, not only in the page —
  the action is a public POST endpoint.
- The provider is fixed by game from a server-side table. No part of the
  request selects a URL, host or endpoint; a set code is shaped to letters,
  digits and dashes first.
- A full sync requires the confirmation checkbox, re-checked on the server.
- Four runs per admin per fifteen minutes, and refused while another run is in
  progress.
- The admin page has a 60-second ceiling. A run cut off by it is marked failed
  after twenty minutes by the next `activeSyncRun` check, and re-running is
  safe. Use the command line for a whole game.

Behaviour, both ways:

- **Idempotent.** Cards upsert on `(game, canonical_card_number)`, printings on
  `(provider_key, provider_external_id)`.
- **Never deletes.** A source temporarily omitting a card must not empty the
  catalogue mid-event. Removal is a deliberate act.
- **Failures are kept.** A record that fails validation is skipped, never
  coerced, and written to `card_sync_failures`.
- **Runs are logged** to `card_sync_runs` and surfaced in `/admin`.

There is no scheduler: a catalogue changes when a set releases. Import the new
set when it does.

## Card images

- Only URLs Scrydex returns are stored, never constructed. The database holds
  URLs, not bytes.
- Rendering needs both gates open: the provider declares `suppliesImages`, and
  `NEXT_PUBLIC_ENABLE_CARD_IMAGES=true`. Either one closed renders the
  placeholder.
- The only allowed host is `images.scrydex.com`, listed in `next.config.ts`
  `remotePatterns` and re-checked by `ALLOWED_IMAGE_HOSTS` in
  `src/lib/cards/images.ts`. Card art uploaded by an admin is served from our
  own `/api/card-art/` route.
- Images go through Next's image optimiser, resized to the displayed size and
  cached.

## "Any printing" still shows a card

A Flare for any printing names no printing, so there was nothing to take
artwork from and those rows rendered no picture at all — the one case where a
picture helps most, since somebody who will take any version is usually
picturing the ordinary one, and a nameless row is hard to spot in a binder.

`pickBasePrinting` chooses a stand-in from the card's other printings, in this
order: it has artwork, it is not a promo, it is named exactly like the card
(a variant is usually marked by appending to the base name, and this is the
only signal that works for Leaders where every printing shares a rarity), then
plainest rarity, then earliest set code.

Artwork is the first test on purpose. A perfectly chosen base printing with no
image shows nothing, which is the problem being solved.

The **label never uses the stand-in**. The row still reads "Any printing",
because that is what was asked for, and the thumbnail carries a small layers
mark so a specific piece of art does not read as a specific request — someone
holding the alternate art should not conclude they cannot help. The mark is
icon-only: spelled out it covered most of a 56px thumbnail and hid the artwork
it was captioning.

## Replacing the provider

Implement `CardDataProvider` from `src/lib/cards/domain.ts`:

```ts
interface CardDataProvider {
  readonly providerKey: string;
  readonly displayName: string;
  readonly suppliesImages: boolean;

  fetchCards(options?: CardFetchOptions): Promise<{
    cards: NormalizedCard[];
    failures: NormalizationFailure[];
  }>;
  fetchCardByExternalId(id: string): Promise<NormalizedCard | null>;
  fetchSets(): Promise<ProviderSet[]>;
  normalizeCard(input: unknown): NormalizedCardResult;
}
```

Nothing downstream — search, the UI, later Flares and matching — knows which
provider produced a row. Swapping providers is a new adapter plus a line in
`src/lib/cards/providers/registry.ts`.

Two things make that practical: `provider_key` is stored on every row, so two
providers can coexist and be told apart; and `raw_metadata` keeps the original
record, so a mapping error is diagnosable after the fact.

`normalizeCard` is deliberately separate from fetching, so a new adapter can be
tested entirely against fixtures with no network.

## Copyright and attribution

Card data is supplied by Scrydex. The games' names and card artwork are
trademarks and copyrights of their respective owners. CardFlare is not
affiliated with or endorsed by them and claims no ownership of any card
artwork or card data. Rendered by `DataAttribution` wherever card data
appears.
