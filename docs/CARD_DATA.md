# CardFlare — Card data

How One Piece card data gets into CardFlare, and why it looks the way it does.

## What CardFlare stores, and what it deliberately does not

| Stored                          | Not stored       |
| ------------------------------- | ---------------- |
| Card number (`OP01-024`)        | Card effect text |
| Name                            | Card artwork     |
| Category, colours, types        | Flavour text     |
| Cost, power, counter, life      | Prices           |
| Printings: set, rarity, variant |                  |
| Aliases players actually use    |                  |

Both absences are decisions, not gaps.

**No effect text.** CardFlare coordinates a meeting between two people who
already know what their cards do. Rules text is the most clearly creative part
of a card and the least useful part for finding one.

**No artwork.** A name, a number and a printing label identify a card
completely across a table. `card_printings.image_url` exists so a provider that
is permitted to supply artwork can, and stays null until that is settled.

> Hot-linking images from someone else's server is not the safe middle ground it
> is usually assumed to be. The "server test" from _Perfect 10 v. Amazon_ says
> the host, not the linker, performs the display — but _Goldman v. Breitbart_
> rejected that reasoning, it varies by circuit, and it says nothing about the
> host's terms of service. Operationally it is worse: the host can add referer
> checks or change URLs at any time, and the failure mode is every card image
> breaking during someone's Friday night event. CardFlare does not do it.

## Card identity versus card printing

A **card** is what a player means when they say "I need OP01-024". A
**printing** is a physical object — base, alternate art, a promo.

Matching keys off the **card**, because someone hunting a card is nearly always
happy with any printing of it. Printing is a preference expressed on top of a
match, never a precondition for one. Getting this backwards would mean a player
holding the alternate art never matches a player who needs the card.

## Importing

```bash
npm run cards:import -- ./one-piece.json
```

Needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It reads
`.env.local` if present. Idempotent — re-running upserts on `(game, code)`
rather than duplicating, so it is safe after a correction or a partial failure.

Printings and aliases are **replaced** per card rather than merged. A card that
loses a printing upstream loses it here; merging would accumulate stale rows
forever.

### File format

An array of cards. Only `code`, `name` and `category` are required.

```json
[
  {
    "code": "OP01-024",
    "name": "Monkey D. Luffy",
    "category": "character",
    "colors": ["red"],
    "types": ["Straw Hat Crew"],
    "cost": 5,
    "power": 6000,
    "counter": 1000,
    "aliases": ["red luffy"],
    "printings": [
      { "setCode": "OP01", "rarity": "SR" },
      { "setCode": "OP01", "rarity": "SEC", "variant": "Alternate Art" }
    ]
  }
]
```

| Field      | Notes                                                            |
| ---------- | ---------------------------------------------------------------- |
| `code`     | Uppercased on import. Unique per game.                           |
| `category` | `leader`, `character`, `event`, `stage` or `don`.                |
| `life`     | Leaders only. `cost` does not apply to them.                     |
| `aliases`  | Lowercased and deduplicated on import.                           |
| `variant`  | Omit for the base printing. `"Alternate Art"`, `"Manga Rare"`, … |
| `imageUrl` | Accepted but **dropped** unless the provider declares `images`.  |

**Validation is all-or-nothing.** A malformed record fails the whole import and
every problem is reported at once, with the offending card number. Wrong card
data is worse than missing card data when someone is hunting a trade, so no
record is ever partially salvaged or silently coerced.

## Adding a different source

Implement `CardProvider` in `src/lib/cards/provider.ts`:

```ts
export interface CardProvider {
  readonly name: string;
  readonly capabilities: { images: boolean };
  fetchCards(): Promise<ProvidedCard[]>;
}
```

`JsonCardProvider` is the reference implementation. Whatever the eventual
source — an official API, a community dataset, a spreadsheet — normalise it
into `ProvidedCard` and nothing downstream changes. Search, Flares and matching
never learn where the data came from.

`capabilities.images` is the single gate on artwork. It is checked once, in the
importer, so a provider that has not declared the capability cannot populate
`image_url` by accident.

## Search

`public.search_cards(search_query, result_limit)`, called with the service role
from a Server Action. Ranking, highest first:

| Match          | Score              |
| -------------- | ------------------ |
| Exact code     | 1.00               |
| Exact name     | 1.00               |
| Exact alias    | 0.98               |
| Code prefix    | 0.95               |
| Name contains  | 0.90               |
| Alias contains | 0.88               |
| Anything else  | trigram similarity |

Results below 0.25 are dropped as noise. The limit is capped at 50 server-side
regardless of what is asked for.

Trigram similarity is why this is a SQL function rather than a PostgREST query:
`similarity()` cannot be expressed through the REST filter syntax, and without
it a misspelling returns nothing. Verified against PostgreSQL 16 — `monkey d
luff` finds Luffy, `roronoa zorro` finds Zoro.

Aliases matter more than they look. Nobody at an event asks for "Monkey D.
Luffy OP01-024"; they ask for "red luffy". Every alias a community actually
uses is a search that succeeds instead of one that fails.
