# CardFlare — Card data

How One Piece card data reaches CardFlare, what is known about it, and what is
not.

> **Status: the provider's response shape has not been inspected.** The adapter
> was written in an environment with no outbound network access, so the field
> mapping is a hypothesis rather than an observation. `MAPPING_STATUS` in
> `src/lib/cards/providers/optcgapi/mapping.ts` is `"unverified"` and every
> network path refuses to run while it stays that way. See
> [Verifying the mapping](#verifying-the-mapping).

## Selected provider

|                     |                                                     |
| ------------------- | --------------------------------------------------- |
| Provider            | OPTCG API — <https://optcgapi.com>                  |
| Documentation       | <https://optcgapi.com/documentation>                |
| Provider key        | `optcgapi`                                          |
| Cost                | Free                                                |
| Supplies image URLs | Documented as yes; **not confirmed**                |
| Terms reviewed      | **No.** See [Copyright](#copyright-and-attribution) |

The upstream operator asks developers not to make excessive requests. CardFlare
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
requests for data the bulk endpoints already return.

## Observed response schema

**Nothing observed yet.** No request has been made to the live API.

`npm run cards:probe` fills this section in. It writes redacted records to
`tests/fixtures/optcgapi/` and prints, per endpoint, every field name with its
type, how many records carry it, and a sample value. Fields present on only
some records are called out — that is the inconsistency report the brief asks
for.

Paste the probe's output here once it has run.

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
- **Language.** Printings default to `en`. Whether the provider offers other
  languages is unknown.
- **Provider timestamps.** `provider_updated_at` is mapped speculatively and may
  never be populated.

## Known image limitations

- Only URLs the provider actually returns are stored. URLs are never
  constructed from a pattern, rewritten, resized, or downloaded.
- Nothing is copied into the repository or into Supabase Storage.
- Rendering needs **both** gates open: the provider declared `suppliesImages`,
  and `NEXT_PUBLIC_ENABLE_CARD_IMAGES=true`.
- Hosts are allow-listed in `next.config.ts` and re-checked in
  `src/lib/cards/images.ts` before render. A URL from anywhere else is ignored.
- When images are off, no `<img>` is rendered at all — nothing is requested from
  a third party.
- A failed load falls back to the CardFlare placeholder with no layout shift.
- The placeholder is a generic card silhouette in CardFlare's palette. It is
  deliberately not a mock One Piece card.

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

```bash
# ~75-150 deterministic records, for interface and database testing
npm run cards:sync:onepiece -- --sample

# the provider's entire catalog
npm run cards:sync:onepiece -- --full --confirm
```

Needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; reads
`.env.local`. Server-side only — there is no endpoint, so no public user can
trigger a sync.

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
- Full mode requires `--confirm` and prints what it will do first.

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

Outstanding, and needing a human decision:

- **The provider's terms have not been read.** Nobody has confirmed that
  storing this data, or displaying its images, is permitted. Do that before the
  full sync and before enabling images.
- **Bandai's site is never scraped.** Only the provider's documented API is
  called.
- **No artwork is copied.** Hot-linking a provider's images with their
  permission is a different thing from redistributing them, and CardFlare does
  neither without that permission.
