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

**The application itself — event rooms, authentication, card search, matching,
trading — has not been built yet.** The landing page says so, and must keep
saying so until it is true.

## Documentation

| Document                                         | What it covers                                     |
| ------------------------------------------------ | -------------------------------------------------- |
| [PRODUCT.md](./PRODUCT.md)                       | What CardFlare is, what it is not, core vocabulary |
| [ARCHITECTURE.md](./ARCHITECTURE.md)             | Stack, structure, security model, testing          |
| [BRAND.md](./BRAND.md)                           | Logo rules, colour tokens, typography, voice       |
| [ROADMAP.md](./ROADMAP.md)                       | Milestones and deferred work                       |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)       | Supabase, Vercel, DNS, launch checklist            |
| [docs/GOOGLE_SHEETS.md](./docs/GOOGLE_SHEETS.md) | Exporting waitlist data safely                     |

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

| Command                | Does                                             |
| ---------------------- | ------------------------------------------------ |
| `npm run dev`          | Development server                               |
| `npm run build`        | Production build                                 |
| `npm run verify`       | Format check, lint, typecheck, unit tests, build |
| `npm test`             | Unit and integration tests                       |
| `npm run test:e2e`     | Playwright tests (builds and starts the app)     |
| `npm run lint`         | ESLint                                           |
| `npm run typecheck`    | `tsc --noEmit`                                   |
| `npm run format`       | Prettier write                                   |
| `npm run brand:assets` | Regenerate logo derivatives from the master      |

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
src/lib/          Supabase client, waitlist schema/action/repository
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

One Piece Card Game and all other trading card game names, logos and card images
are trademarks of their respective owners. CardFlare is not affiliated with,
endorsed by, or sponsored by any trading card game publisher.
