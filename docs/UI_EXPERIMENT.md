# UI experiment: card search and traders near you

A reversible experiment, OFF by default everywhere. Branch
`experiment/search-nearby-overhaul`, worktree `../cardflare-ui-lab`.
Nothing here is deployed, and no database migration was added or run.

## What it changes (only while switched on)

**App, Search tab** (`mobile/src/screens/search-lab.tsx`):

- One large field ("Find your next card..."), debounced 250 ms.
- Game chips: All, One Piece, Lorcana, Magic, Pokémon, Flesh & Blood, and
  Riftbound as "Soon", which can't be chosen. Riftbound has no cards in the
  catalogue yet (checked against the live search on 2026-11-22).
- Recently viewed cards, stored on the phone per account with a Clear button.
- Browse by game: a tile per game using the existing intro photos.
- Results are artwork first, three across. Each shows the number, game,
  lead printing and "+N printings". Printings are never merged; the card page
  is where you choose one.
- "Hunt it" on every result opens the Flare composer with the card filled in.
- Players and stores that match are still listed below the cards.

**App, Nearby tab**: a "Traders near you" card sits above the Flares, under
the store "You're here" banner. Its "See all" opens `Traders`
(`mobile/src/screens/traders.tsx`), with filters for distance (10/25/50/100
mi), game, and "Only people with cards I hunt", plus pull to refresh.

**Server**: `GET /api/v1/nearby/traders` (`src/lib/nearby/traders.ts`,
ranking in `src/lib/nearby/traders-rank.ts`). It answers **404** unless the
server runs with `CARDFLARE_UI_EXPERIMENT=1`.

### What "traders near you" counts, and never counts

- It lists only players who switched on **Nearby matching** and saved a ZIP.
  You have to have it on too, to see anyone.
- Distance is ZIP centroid to ZIP centroid, rounded ("Under 2 mi away",
  "About 7 mi away"). No coordinates or addresses ever leave the server.
- "N cards for trade" is the number of copies in binders marked **up for
  trade**, which are already public on profiles. Private binders and the
  imported collection are never counted.
- "N cards match your Hunts" counts distinct cards of theirs up for trade
  that are on your saved wants, your open want Flares or your open hunt
  requests. A match means the same card, any printing.
- Blocked players are excluded in both directions.
- The screen never shows prices, because there is no price data.

**Product note:** matching.ts says "nobody can browse anybody's list. No
tab, no feed of listings." This lists people and a count, never the cards,
and only people who opted in. Whether to adopt it is the founder's call.

## Run it

Two terminals. The website must run locally because the new endpoint isn't
deployed. Everything else in the app keeps talking to cardflare.gg.

```bash
# 1. The website, with the experiment's endpoint switched on
cd ~/cardflare-ui-lab
cp ~/cardflare/.env.local .env.local        # first time only (gitignored)
CARDFLARE_UI_EXPERIMENT=1 npx next dev -p 3000

# 2. The app's bundler, with the experiment switched on
cd ~/cardflare-ui-lab/mobile
EXPO_PUBLIC_CARDFLARE_UI_EXPERIMENT=1 \
EXPO_PUBLIC_CARDFLARE_UI_EXPERIMENT_API=http://localhost:3000 \
npx expo start --dev-client --clear
```

Then open the dev build in the simulator. Stop any other Metro on port 8081
first.

To see the traders list filled with made-up people, use Settings → Demo
mode → Turn demo mode on. That only exists in development builds; the demo
answer is in `mobile/src/demo/demo-server.ts`. With demo mode off, the list
is real: your ZIP or this phone's location, and real opted-in players.

## Switch it off

Restart Metro **without** the two `EXPO_PUBLIC_CARDFLARE_UI_EXPERIMENT*`
variables (and `--clear`). The Search and Nearby tabs go back to the
original screens. Stop the local `next dev`.

No real build can switch it on, because EAS, TestFlight and App Store builds
never set those variables (`tests/unit/ui-experiment.test.ts` checks
`app.json` and `eas.json`).

## Go back to the original app

```bash
cd ~/cardflare/mobile && npx expo start --dev-client --clear   # main checkout
```

## Remove it entirely

The experiment lives only on its branch and worktree, and main is untouched:

```bash
cd ~/cardflare
git worktree remove ../cardflare-ui-lab          # add --force if it has uncommitted files
git branch -D experiment/search-nearby-overhaul  # only if you're sure
```

## What adopting it would still need

- **The website.** This round is app-only. The repo rule is both platforms,
  so the website needs the same Search and Traders before it ships.
- **A browse endpoint.** A game tile currently scopes the search and focuses
  the field, because there is no catalogue-browse or set-list endpoint.
  Browsing a game without typing needs one (for example, sets by game, then
  cards by set).
- **Scale.** Traders are computed per request in TypeScript: up to 2,000
  opted-in players, then the binder cards of the ones in range. A city's
  worth wants one Postgres function that does the distance and the sums in
  SQL.
- **Rarity on results.** Search results carry no rarity field; today it only
  appears inside the printing label.
- **Venue-aware traders.** "You're here" (a verified store) stays its own
  banner above the traders. Listing only the players in the same room would
  need the room's participant list, not distance.
