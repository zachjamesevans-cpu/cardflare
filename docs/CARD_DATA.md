# CardFlare — Card data

How One Piece card data reaches CardFlare, what is known about it, and what is
not.

> **Status: verified against `/api/allSetCards/` and `/api/allPromos/` on
> 2 August 2026**, and against a real `/api/allDonCards/` record — which is why
> DON!! cards are now deliberately excluded rather than failing every run. The
> starter-deck endpoint has **not** been observed; its shape is assumed to match
> the set endpoint and imports cleanly at scale, which is evidence but not
> proof. Run `npm run cards:probe` to confirm.

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

| Endpoint            | Purpose                             |
| ------------------- | ----------------------------------- |
| `/api/allSetCards/` | Booster set cards                   |
| `/api/allSTCards/`  | Starter deck cards                  |
| `/api/allPromos/`   | Promo cards                         |
| `/api/allDonCards/` | DON!! cards — not synced, see below |
| `/api/allSets/`     | Set list                            |

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
Don!!**. The promo path is `/api/allPromos/` — `/api/allPromoCards/` was
inferred from the naming of its neighbours, and 404s.

## Observed response schema

`GET /api/allSetCards/` returns a **JSON array**. One record, observed
2 August 2026 and saved as `tests/fixtures/optcgapi/allSetCards.json`:

| Field             | Type       | Example                                                        | Mapped to                |
| ----------------- | ---------- | -------------------------------------------------------------- | ------------------------ |
| `card_set_id`     | string     | `"OP01-077"`                                                   | `canonical_card_number`  |
| `card_name`       | string     | `"Perona"`                                                     | `exact_name`             |
| `card_type`       | string     | `"Character"`                                                  | `card_type` (lowercased) |
| `card_color`      | string     | `"Blue"`, `"Blue Green Purple Red Black Yellow"`               | `colors[]`               |
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

`/api/allSets/` and `/api/allDecks/` opened successfully but their records have
not been inspected. They are product listings rather than cards and are not
synced.

`/api/allDonCards/` **has** been inspected, and is no longer called — see
**DON!! cards** below.

## DON!! cards are not imported

An observed record from `/api/allDonCards/`, 2 Aug 2026:

```json
{
  "don_id": null,
  "rarity": "DON!!",
  "card_name": "DON!! Card (Egghead)",
  "card_text": "Your Turn +1000",
  "card_type": "DON!!",
  "card_image_id": "don_1",
  "optcg_don_name": "DON!! Card (Egghead) - The Azure Sea's Seven (OP14)"
}
```

There is no `card_set_id` and no other field carrying a card number, because
DON!! cards do not have one. This is not a mapping error. Every full sync was
rejecting 187 of these for a missing card number — the right outcome, reached
for a reason that read like a bug.

`canonical_card_number` is NOT NULL and is half of a card's identity. Importing
these means putting something in it, and the only candidates are
`card_image_id` (`"don_1"`) or a string parsed out of `optcg_don_name`. The
first would render as `DON_1` beside the card name as though Bandai printed it
there; the second is guesswork. Neither is a card number.

**Cost of the exclusion.** Alternate-art DON!! cards are collected and traded,
so this is a real gap, not a technicality. A player looking for the Egghead
DON!! will not find it in CardFlare.

**What supporting them properly requires**, whenever it is wanted:

1. Make `canonical_card_number` and `compact_card_number` nullable.
2. Add a unique key on `(game, provider_key, provider_external_id)` so a card
   with no number still has exactly one identity.
3. Teach `search_cards` to rank a numberless card on name alone.
4. Teach the UI to omit the card-number chip rather than render an empty one.

That is a schema change, so it is a decision to take deliberately rather than a
side effect of a sync.

## Colours and traits are separated differently

`card_color` on a rainbow Leader is `"Blue Green Purple Red Black Yellow"` —
one space-separated string, 34 characters, past the 24-character limit on a
colour. Five such records were rejected by the 2 Aug 2026 full sync. Colours
are therefore split on whitespace as well as punctuation.

The limit was **not** raised to accommodate it. A single 34-character token is
not a colour, and is still rejected — otherwise the next unexpected shape gets
waved through instead of recorded.

`sub_types` is space-separated too, and is deliberately **not** treated the
same way. Trait names contain spaces: `"Straw Hat Crew The Four Emperors"` is
two traits, and splitting on whitespace would produce six meaningless
fragments. There is no separator in the data to tell them apart.

> **Known limitation.** A card with more than one trait stores them as a single
> combined string. Trait search still matches, because the text is present;
> filtering by an exact trait does not. Fixing this needs a list of valid
> One Piece traits to match against, which is a data source we do not have.

## One record is malformed at source

`OP10-042` — Usopp (Official Playmat -Limited Edition Vol. 3-) — arrives from
`/api/allPromos/` with its fields shifted by one:

| Field        | Value                        | What it actually is |
| ------------ | ---------------------------- | ------------------- |
| `life`       | `"5000"`                     | a power             |
| `card_power` | `"Straw Hat Crew Dressrosa"` | traits              |
| `sub_types`  | `"Ranged"`                   | an attribute        |
| `attribute`  | `null`                       | —                   |

This is not a mapping error. A correctly-formed record from the same endpoint
has `life: "5"`, `card_power: "5000"`, a trait list in `sub_types` and an
attribute in `attribute`. The data is wrong at the provider, and the record is
skipped.

The rejection reads `life: Too big: expected number to be <=99`, which invites
raising the ceiling. **Do not.** A One Piece Leader has 3–5 life, so 99 is
already generous, and a value in the thousands can only be a power. Raising it
would import a Leader with 5000 life, no power, and an attribute in its trait
list. `tests/unit/card-shifted-record.test.ts` locks this in.

**Consequence:** OP10-042 is absent from the catalog. One card, and the right
one to lose.

> **Worth remembering.** This record failed only because the shift pushed a
> value out of range. A row shifted between two fields of compatible type —
> two strings, say — would import silently and wrongly. Validation catches
> impossible values, not implausible ones. That is what the ten-card accuracy
> check is for, and why it is not optional.

## Alternate arts

A card number is one gameplay identity. It can be several physical cards:
OP12-034 Perona exists as a base art and an alternate art, both returned by
`/api/allSetCards/` with the same `card_set_id`.

They were always stored correctly as two printings — the printing key
fingerprints over rarity and image URL, which differ — but only the first was
ever rendered, so the alternate art was invisible in search.

- **`card_printings.rarity`** holds each printing's own rarity. It is also on
  `cards`, deliberately: the card-level value is what search ranks on and is
  the rarity most people mean, but `mergeByCardNumber` keeps the first record's
  value, so it can only ever hold one of them.
- **The search result shows every printing** when there is more than one, each
  with its own thumbnail and label. One printing renders exactly as before.
- **The label carries the rarity** — `OP12 · C` against `OP12 · SR`. Without it
  both printings render as `OP12` and the strip shows the same chip twice.
- The strip is **not interactive**. The result row is already a button, and
  choosing a specific printing belongs with Flares, where there is something to
  choose it for.

> Printings imported before this change have a null printing rarity, which is
> honest — nobody had recorded it. Re-run a full sync to fill it in.

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
| `colors`                           | Split on `/ , ; \|` **and whitespace**. A multicolour Leader arrives as one space-separated string; see below.                                                                               |
| `traits`                           | Split on `/ , ; \|` only. Trait names contain spaces, so whitespace cannot be a separator; see the limitation below.                                                                         |
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

- **The promo path is `/api/allPromos/`.** `/api/allPromoCards/`, inferred from
  the naming of its neighbours, 404s — which silently cost the catalog every
  promo while the sync still reported success. Corrected against the provider's
  documentation on 2 Aug 2026. A missing endpoint does not fail the sync: it is
  recorded in `card_sync_failures` and the remaining endpoints still import.

- **A promo repeats the booster printing's card number and set id.** The
  documented sample has `card_set_id: "OP09-077"` and `set_id: "OP09"`, the same
  as the booster printing, distinguished only by `set_name` and a parenthetical
  suffix on the name. The printing key includes the endpoint group for exactly
  this reason, so the two are stored as two printings of one card rather than
  merged. `is_promo` is set to true for this group — the provider served it from
  the promos endpoint, so that is its classification, not an inference. The
  other three flags stay null.

- **The documented promo records carry no artwork.** Both have `card_image` and
  `card_image_id` set to null, so promos render the placeholder even with images
  enabled.

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
