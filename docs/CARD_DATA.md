# CardFlare — Card data

How One Piece card data reaches CardFlare, what is known about it, and what is
not.

> **Status: verified against `/api/allSetCards/` on 2 August 2026.** One real
> record was inspected and the mapping corrected against it. The starter-deck,
> promo and DON!! endpoints have **not** been observed — their shapes are
> assumed to match and may not. Run `npm run cards:probe` to confirm.

## Selected provider

|                     |                                                     |
| ------------------- | --------------------------------------------------- |
| Provider            | OPTCG API — <https://optcgapi.com>                  |
| Documentation       | <https://optcgapi.com/documentation>                |
| Provider key        | `optcgapi`                                          |
| Cost                | Free                                                |
| Supplies image URLs | Documented as yes; **not confirmed**                |
| Terms reviewed      | **No.** See [Copyright](#copyright-and-attribution) |

**The API is one person's VPS, paid for monthly out of pocket.** The
documentation asks, in the author's own words, not to make "an insane amount of
API calls each day" and not to "hurt my wallet too much". That is not
boilerplate rate-limiting language and CardFlare treats it as a hard
constraint, not a suggestion. CardFlare
honours that in three ways: bulk endpoints only, one request at a time with a
pause between them, and the provider is never queried at runtime — search reads
the local Supabase catalog.

## Endpoints

Bulk endpoints, used by the sync:

| Endpoint              | Purpose            |
| --------------------- | ------------------ |
| `/api/allSetCards/`   | Booster set cards  |
| `/api/allSTCards/`    | Starter deck cards |
| `/api/allPromoCards/` | Promo cards        |
| `/api/allDonCards/`   | DON!! cards        |
| `/api/allSets/`       | Set list           |

Per-record endpoints, used only by `fetchCardByExternalId`:

| Endpoint                    | Purpose  |
| --------------------------- | -------- |
| `/api/sets/card/{card_id}/` | One card |

`/api/sets/{set_id}/`, `/api/decks/{st_id}/` and `/api/decks/card/{card_id}/`
are documented but unused: walking sets one at a time would be thousands of
requests for data the bulk endpoints already return, against a server somebody
pays for personally.

**`{card_id}` is the printed card number.** The documentation's own worked
example is `https://optcgapi.com/api/sets/card/OP01-001/`. So the provider's
notion of a card identifier is the card number itself, not an opaque row id —
which is why `card_id` is a candidate for `canonical_card_number` and why
`fetchCardByExternalId` is passed a card number in practice.

The documentation lists four endpoint groups: **Sets, Starter Decks, Promos,
Don!!**. Promos therefore exist as a group; only the `/api/allPromoCards/` path
is wrong. The correct path is still unknown.

## Observed response schema

`GET /api/allSetCards/` returns a **JSON array**. One record, observed
2 August 2026 and saved as `tests/fixtures/optcgapi/allSetCards.json`:

| Field             | Type       | Example                                                        | Mapped to                |
| ----------------- | ---------- | -------------------------------------------------------------- | ------------------------ |
| `card_set_id`     | string     | `"OP01-077"`                                                   | `canonical_card_number`  |
| `card_name`       | string     | `"Perona"`                                                     | `exact_name`             |
| `card_type`       | string     | `"Character"`                                                  | `card_type` (lowercased) |
| `card_color`      | string     | `"Blue"`                                                       | `colors[]`               |
| `card_cost`       | **string** | `"1"`                                                          | `cost`                   |
| `card_power`      | **string** | `"2000"`                                                       | `power`                  |
| `counter_amount`  | **number** | `1000`                                                         | `counter`                |
| `life`            | null       | `null`                                                         | `life`                   |
| `rarity`          | string     | `"UC"`                                                         | `rarity`                 |
| `sub_types`       | string     | `"Thriller Bark Pirates"`                                      | `traits[]`               |
| `attribute`       | string     | `"Special"`                                                    | `attribute`              |
| `set_id`          | string     | `"OP-01"`                                                      | `set_code`               |
| `set_name`        | string     | `"Romance Dawn"`                                               | `set_name`               |
| `card_text`       | string     | `"[On Play] …"`                                                | `effect_text`            |
| `date_scraped`    | string     | `"2026-07-31"`                                                 | `provider_updated_at`    |
| `card_image_id`   | string     | `"OP01-077"`                                                   | `image_id` — see below   |
| `card_image`      | string     | `"https://optcgapi.com/media/static/Card_Images/OP01-077.jpg"` | `image_url`              |
| `inventory_price` | number     | `0.89`                                                         | **dropped**              |
| `market_price`    | number     | `0.92`                                                         | **dropped**              |

Five findings from that one record, each of which changed the code:

1. **Bulk endpoints carry images.** `card_image` is present on the bulk set
   endpoint, so no per-card image fan-out is needed. That removes the whole
   contingency plan for image backfill.
2. **The image host is `optcgapi.com`**, under `/media/static/Card_Images/`.
   Already the allow-listed host in `next.config.ts`.
3. **`card_image_id` repeats the card number.** Despite the name it is _not_ a
   per-artwork identifier, and using it as the printing discriminator would give
   two artworks one key. It is ignored when it equals the card number; the
   fingerprint — which includes the image URL — takes over.
4. **Numeric types are inconsistent.** `card_cost` and `card_power` are strings,
   `counter_amount` is a number. Both are coerced.
5. **There is no trigger field.** Trigger text, where a card has any, is inside
   `card_text`. Nothing is mapped to `trigger_text` rather than guessing at a
   split.

`set_id` is `"OP-01"` while `card_set_id` is `"OP01-077"` — the set code is
_not_ the card number's prefix. Set filtering matches `"OP-01"`, not `"OP01"`.

**Pricing is dropped before storage.** `inventory_price` and `market_price` are
stripped from `raw_metadata` as well as ignored: pricing is out of scope, and
storing figures we never display would leave stale numbers waiting to be
surfaced by accident.

### Not yet observed

`/api/allSTCards/`, `/api/allDonCards/`, `/api/allSets/` and `/api/allDecks/`
opened successfully but their records have not been inspected.
`/api/allPromoCards/` returns 404. Their field names are assumed to match the
set endpoint, which is a guess — a record that does not match is skipped and
recorded in `card_sync_failures` rather than imported wrong.

## Mapping decisions

`CANDIDATE_FIELDS` maps each CardFlare field to a list of candidate source
keys; the first present on a record wins. Every entry is currently a guess.

| CardFlare field                    | Notes                                                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canonical_card_number`            | Uppercased. **Never falls back to a generic `id`** — an early version did, and a record with no card number silently adopted its provider id, producing a card nobody could ever search for. |
| `exact_name`                       | The provider's display name, byte for byte.                                                                                                                                                  |
| `normalized_name`                  | Lowercased, punctuation stripped, whitespace collapsed. NFKC, not NFKD: decomposing splits a Japanese dakuten and the punctuation strip then eats the mark, turning ゾ into ソ.              |
| `compact_card_number`              | Letters and digits only, so `op01024` finds `OP01-024`.                                                                                                                                      |
| `card_type`                        | Lowercased so filtering is predictable.                                                                                                                                                      |
| `colors`, `traits`                 | Arrays. Split on `/ , ; \|`. Multicolour cards are real.                                                                                                                                     |
| `cost`, `power`, `counter`, `life` | Parsed from strings. `"-"` and `""` become null, not zero — a Leader has no cost.                                                                                                            |
| `effect_text`, `trigger_text`      | Stored verbatim, nullable.                                                                                                                                                                   |
| `image_url`                        | On the printing, nullable, `https` only.                                                                                                                                                     |
| `raw_metadata`                     | The whole provider record, on both card and printing.                                                                                                                                        |

### The printing key

`card_printings.provider_external_id` is **composite**, not the provider's raw
id:

```
<source>:<card number>:<image id | distinct record id | fingerprint>
```

Card number alone would merge an alternate art into its base printing. Source
separates the same number appearing in a booster and a starter deck. The image
id (`card_image_id`) is the provider's own per-artwork identifier and the
strongest discriminator available.

Two subtleties, both found by testing:

- A record id that simply repeats the card number is **not** a discriminator.
  `card_set_id` is a candidate for both fields, so it degenerated into the card
  number on some records and gave two artworks one key. It is now ignored when
  it equals the card number.
- The fingerprint is a last resort, hashed over the parts that actually differ
  between printings, so two arts still get two rows when the provider offers no
  id at all.

### Card identity versus printing

`cards` is the gameplay identity — one row per card number. `card_printings` is
one row per provider record.

The sync collapses records sharing a card number into one card with several
printings. The merge is **non-destructive**: the first record establishes the
card, later ones only fill fields left null, and every distinct printing is
kept.

**Variant classification is not attempted.** `variant_type`,
`is_alternate_art`, `is_promo`, `is_parallel` and `is_reprint` are all
nullable, and the adapter sets them to null throughout. Null means _the
provider did not tell us_, which is not the same as false. Inferring "alternate
art" from a rarity code or a name suffix would be a guess, and a wrong guess
either splits one card in two or merges two into one. If the probe shows the
provider classifies printings explicitly, map those fields then — not before.

## Known data gaps

Unknown until the probe runs. What is already known:

- **`/api/allPromoCards/` returns 404**, confirmed by opening it in a browser on
  2 Aug 2026. Promo coverage is therefore absent unless promos appear inside
  another endpoint. A missing endpoint no longer fails the sync: it is recorded
  in `card_sync_failures` and the remaining endpoints still import.

- **Coverage is unverified.** No claim is made that this provider carries every
  One Piece card, or that any set is complete.
- **Accuracy is unverified.** The ten-record spot check the brief asks for
  cannot be done before a sample import exists.
- **Bulk endpoints may not carry images.** The provider's documentation
  associates `card_image` / `card_image_id` with the individual-card endpoints.
  If the probe confirms the bulk endpoints omit them, the sync imports full text
  metadata from bulk and backfills images **only for the deterministic sample**,
  rate-limited. It will not fan out one request per card across the whole
  catalog — that is thousands of requests against a server one person pays for,
  and it stops and reports instead.
- **Language.** Printings default to `en`. Whether the provider offers other
  languages is unknown.
- **Provider timestamps.** `provider_updated_at` is mapped speculatively and may
  never be populated.

## Card images

Artwork rendering was switched on deliberately, after the founder reviewed the
provider's terms. It is not a default and can be turned off again by setting
`NEXT_PUBLIC_ENABLE_CARD_IMAGES=false` and redeploying.

**What the app does:**

- Only URLs the provider actually returns are stored. A URL is never
  constructed from a pattern or guessed from a card number.
- No image file is committed to the repository or copied into Supabase Storage.
  The database holds URLs, not bytes.
- Rendering needs **both** gates open: the provider declared `suppliesImages`,
  and `NEXT_PUBLIC_ENABLE_CARD_IMAGES=true`. Either one closed renders the
  placeholder.
- Hosts are allow-listed in `next.config.ts` and re-checked in
  `src/lib/cards/images.ts` before render. A URL from anywhere else is ignored
  rather than rendered. The allow-list is by host, not by path, because only
  the `/api/allSetCards/` image location has been observed.
- Images are served through Next's image optimiser. The server fetches each
  image once, resizes it to the size actually displayed, and caches it. That
  means a visitor's browser does **not** pull a full-size JPEG from the
  provider on every search — which matters both for store wifi and for not
  hammering a free service.
- A failed load falls back to the CardFlare placeholder with no layout shift,
  because the placeholder is always mounted underneath.
- The placeholder is a generic card silhouette in CardFlare's palette. It is
  deliberately not a mock One Piece card.
- `/cards` carries a trademark and attribution note naming artwork as well as
  data.

**What it does not do:** claim any rights in the artwork. The images are
Bandai's. The note on `/cards` says so.

## Verifying the mapping

```bash
npm run cards:probe
```

Read-only, no credentials, no database writes. Then:

1. Correct `CANDIDATE_FIELDS` in
   `src/lib/cards/providers/optcgapi/mapping.ts` against the probe's report.
2. Fill in this document's **Observed response schema** section.
3. Set `MAPPING_STATUS = "verified"` and `MAPPING_VERIFIED_ON` to today's date.
4. Run the sample sync.

Until step 3, `fetchCards`, `fetchSets` and `fetchCardByExternalId` all throw
`MappingUnverifiedError` before touching the network.

## Synchronisation

Two ways to run the same `syncCards` call. Neither is reachable by a public
user.

### From the admin console

**Admin → Card catalog** offers a sample or a full sync. This is the ordinary
way to import cards: it runs on the deployed server, so it uses the
service-role key that is already configured there and needs no checkout, no
Node installation, and no copy of the key on anyone's laptop.

- Gated by the same admin check as store invites, applied inside the Server
  Action rather than in the page — the action is a public POST endpoint, so
  hiding the button would gate nothing.
- The provider is fixed in the action. No part of the request selects a URL, a
  host or an endpoint.
- A full sync additionally requires the confirmation checkbox, re-checked on
  the server. It is the browser equivalent of `--confirm`.
- Limited to four runs per admin per fifteen minutes, and refused outright
  while another run is in progress.
- The admin page sets `maxDuration = 60`, the ceiling every Vercel plan
  permits. A full catalog pull can exceed that. If it does, the request is cut
  off, the run is marked `failed` after twenty minutes by the next
  `activeSyncRun` check, and re-running is safe — see **Resumable** below. Use
  the command line for the full catalog if it will not fit in sixty seconds.

### From the command line

```bash
# ~75-150 deterministic records, for interface and database testing
npm run cards:sync:onepiece -- --sample

# the provider's entire catalog
npm run cards:sync:onepiece -- --full --confirm
```

Needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; reads
`.env.local`. The reference implementation, and the only option with no time
limit.

> The sample is a deterministic prefix of each endpoint. It is **not** a
> popularity or metagame selection and should not be read as one.

Behaviour:

- **Idempotent.** Cards upsert on `(game, canonical_card_number)`, printings on
  `(provider_key, provider_external_id)`. Running twice updates.
- **Never deletes.** A provider temporarily omitting a card must not empty the
  catalog mid-event. Removal is a deliberate act.
- **Resumable.** Because it only ever upserts, an interrupted run is safely
  re-run from the start.
- **Failures are kept.** A record that fails validation is skipped, never
  coerced, and written to `card_sync_failures` with its payload.
- **Runs are logged** to `card_sync_runs`, surfaced in `/admin`.
- **One at a time.** A run left in `running` for more than twenty minutes is
  treated as abandoned and marked failed, so a killed process cannot wedge the
  console.
- Full mode requires `--confirm` (or the checkbox) and says what it will do
  first.

## Update strategy

Re-run the sample sync after a provider change to confirm the mapping still
holds, then the full sync. There is no scheduler: a card catalog changes when a
set releases, not continuously, and an unattended job against a free API is a
good way to lose access to it.

Watch `/admin` → Configuration → Cards for the loaded count and the last run.

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
provider produced a row. Swapping providers is a new adapter plus a line in the
sync script.

Two things make that practical: `provider_key` is stored on every row, so two
providers can coexist and be told apart; and `raw_metadata` keeps the original
record, so a mapping error is diagnosable after the fact.

`normalizeCard` is deliberately separate from fetching, so a new adapter can be
tested entirely against fixtures with no network.

## Copyright and attribution

Card data is supplied by third-party data providers. ONE PIECE and the ONE
PIECE CARD GAME are trademarks of their respective owners. CardFlare is not
affiliated with or endorsed by Bandai, Shueisha, Toei Animation, or other
rights holders, and does not claim ownership of any card artwork or card data.

Rendered by `DataAttribution` wherever card data appears.

What the provider's documentation does and does not say, as of 2 Aug 2026:

- **Says:** the API needs no authentication and is "open for anyone to use",
  read-only, with a request not to make excessive calls. That covers _reading
  and storing the metadata_, which is what the sync does.
- **Says:** "One Piece and the One Piece Trading Card Game data are trademarks
  of Eiichiro Oda, Bandai, Shonen Jump, and Viz Media" — the provider makes no
  ownership claim of its own.
- **Does not say anything about images.** There is no grant, and no
  prohibition, covering redistributing or displaying card artwork served from
  their host. Absence of a prohibition is not permission.

`NEXT_PUBLIC_ENABLE_CARD_IMAGES` therefore stays **off**. Turning it on is a
decision that needs something firmer than silence — a direct answer from the
provider, or a rights holder's own terms.

Outstanding, and needing a human decision:

- **Bandai's site is never scraped.** Only the provider's documented API is
  called.
- **No artwork is copied.** Hot-linking a provider's images with their
  permission is a different thing from redistributing them, and CardFlare does
  neither without that permission.
