# UI experiment: card search and traders near you

Built as a reversible experiment on `experiment/search-nearby-overhaul`,
then **shipped ON** by the founder on 2026-11-22 ("push this to main branch
and app"). Both halves keep an off switch (below). No database migration was
added or run.

## What it changes

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
ranking in `src/lib/nearby/traders-rank.ts`). It answers **404** when the
server runs with `CARDFLARE_UI_EXPERIMENT=0`.

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

## Switch it off

- **Server:** set `CARDFLARE_UI_EXPERIMENT=0` in Vercel's environment and
  redeploy. `GET /api/v1/nearby/traders` then answers 404, and the app's
  Traders card says it couldn't load.
- **App:** build with `EXPO_PUBLIC_CARDFLARE_UI_EXPERIMENT=0` (for example in
  `eas.json`'s production `env`), or locally start Metro with it. The Search
  and Nearby tabs go back to the original screens.

## Try a server change locally

```bash
cd <repo> && npx next dev -p 3000
cd <repo>/mobile && EXPO_PUBLIC_CARDFLARE_UI_EXPERIMENT_API=http://localhost:3000 npx expo start --dev-client --clear
```

Only the traders request goes to the local server; everything else stays on
cardflare.gg. To see the list filled with made-up people, turn on Settings →
Demo mode (development builds only).

## Remove it entirely

Revert the merge commit on main (`git revert -m 1 <merge sha>`), or switch
both halves off as above. The original Search screen
(`mobile/src/screens/search.tsx`) and Nearby are unchanged in the code.

## Still to do

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
