# CardFlare

**Find the card. Make the trade.**

CardFlare helps players at physical TCG events find cards available from other
people in the same room. Players join a live event through a QR code, post cards
they need as _Flares_, list cards they have available, get matched in real time,
and meet up to trade in person.

- **Domain:** https://cardflare.gg
- **First supported game:** One Piece Card Game
- **Platform:** Mobile-first web application

## Current status

The public splash page and waitlist are **live at https://cardflare.gg**.

Built since: store sign-in and the admin console, guest player sessions, Event
Rooms with printable QR codes, joining a room by scanning, and card search. A
store can run an event and watch players arrive. **Posting Flares, matching and
trades have not been built**, so the loop does not close yet — the landing page
still says CardFlare is being built, and must keep saying so until it is true.

No card data ships in this repository; it is synchronised from a provider.
Card images are behind `NEXT_PUBLIC_ENABLE_CARD_IMAGES`, off by default. See
[docs/CARD_DATA.md](./docs/CARD_DATA.md). Milestone detail is in
[ROADMAP.md](./ROADMAP.md).

## Documentation

| Document                                         | What it covers                                       |
| ------------------------------------------------ | ---------------------------------------------------- |
| [PRODUCT.md](./PRODUCT.md)                       | What CardFlare is, what it is not, core vocabulary   |
| [ARCHITECTURE.md](./ARCHITECTURE.md)             | Stack, structure, security model, testing            |
| [BRAND.md](./BRAND.md)                           | Logo rules, colour tokens, typography, voice         |
| [ROADMAP.md](./ROADMAP.md)                       | Milestones and deferred work                         |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)       | Supabase, Vercel, DNS, launch checklist              |
| [docs/CARD_DATA.md](./docs/CARD_DATA.md)         | Importing card data, and what is deliberately absent |
| [docs/GOOGLE_SHEETS.md](./docs/GOOGLE_SHEETS.md) | Exporting waitlist data safely                       |

## Getting started

```bash
npm install
cp .env.example .env.local   # add Supabase values
npm run dev
```

Open <http://localhost:3000>.

Without Supabase credentials the site runs and the form validates, but
submissions return a generic error — the same behaviour production has when
misconfigured.

## Scripts

| Command                                           | Does                                             |
| ------------------------------------------------- | ------------------------------------------------ |
| `npm run dev`                                     | Development server                               |
| `npm run build`                                   | Production build                                 |
| `npm run verify`                                  | Format check, lint, typecheck, unit tests, build |
| `npm test`                                        | Unit and integration tests                       |
| `npm run test:e2e`                                | Playwright tests (builds and starts the app)     |
| `npm run lint`                                    | ESLint                                           |
| `npm run typecheck`                               | `tsc --noEmit`                                   |
| `npm run format`                                  | Prettier write                                   |
| `npm run brand:assets`                            | Regenerate logo derivatives from the master      |
| `npm run cards:probe`                             | Inspect the card provider's live response shape  |
| `npm run cards:sync:onepiece -- --sample`         | Import ~75–150 cards for testing                 |
| `npm run cards:sync:onepiece -- --full --confirm` | Import the full catalog                          |

## Environment variables

See [`.env.example`](./.env.example). Only variables the app actually reads are
listed there.

`SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. It is server-only,
must never carry a `NEXT_PUBLIC_` prefix, and must never be committed.

## Project layout

```
public/brand/     Approved logo master and derivatives
scripts/          Brand asset generation
src/app/          Routes, metadata, icons, OG image
src/components/   UI primitives, layout, marketing sections, app previews
src/lib/          Supabase clients, auth, waitlist, players, events, cards
supabase/         SQL migrations
tests/            Vitest unit tests and Playwright E2E tests
```

## Contributing notes

- Server Components by default; add `"use client"` only when interactivity
  requires it.
- Never hardcode brand colours. Use the tokens in `src/app/globals.css`.
- Never trust client-side validation. The Server Action re-validates everything.
- Do not add a control that looks interactive but does nothing.
- Product scope changes need approval — see [PRODUCT.md](./PRODUCT.md).

## Legal

The Privacy Policy and Terms of Service are clearly-labelled **drafts**. Legal
review is recommended before broad commercial launch.

Card data is supplied by third-party data providers. ONE PIECE and the ONE
PIECE CARD GAME are trademarks of their respective owners. CardFlare is not
affiliated with or endorsed by Bandai, Shueisha, Toei Animation, or other rights
holders, and does not claim ownership of any card artwork or card data.
