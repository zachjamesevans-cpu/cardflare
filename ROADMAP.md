# CardFlare — Roadmap

Milestones ship one at a time. Each one stops for approval before the next
begins. See [PRODUCT.md](./PRODUCT.md) for scope boundaries.

## ✅ Milestone 1 — Public splash page and waitlist

**Status: complete, pending deployment by the project owner.**

- Landing page: navigation, hero, how it works, for players, for stores,
  product preview, early access, waitlist, footer
- Design token system and reusable component library
- Secure waitlist backed by Supabase with RLS, validation, duplicate handling,
  rate limiting and honeypot
- Privacy and Terms drafts
- SEO, Open Graph, Twitter, robots, sitemap, icons, structured data
- Unit, integration and E2E tests

## ⏸ Awaiting approval

Do not start these until Milestone 1 is approved.

### Milestone 2 — Foundations

Supabase application schema, player authentication, guest sessions, store
accounts, Row Level Security.

### Milestone 3 — Events

Store dashboard, event creation, QR codes, room codes, event lifecycle.

### Milestone 4 — Joining

Player joins event, guest profile, avatar, event lobby, presence.

### Milestone 5 — Cards

Card provider abstraction, One Piece card data, card identity versus card
printing, search and aliases.

### Milestone 6 — Lists

Flares, Have Lists, quantities, preferences.

### Milestone 7 — Matching

Matching engine, realtime match notifications, structured meetup responses.

### Milestone 8 — Trades

Trade confirmation, quantity updates, trade history, event analytics.

## Deferred from Milestone 1

Tracked so they are not lost, none blocking launch.

| Item                         | Notes                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Confirmation email**       | Deliberately not built. Requires a verified sending domain; sending before DNS and sender configuration are valid damages deliverability. Add once `cardflare.gg` DNS is live. |
| **Google Sheets sync**       | Supabase stays the source of truth. See [docs/GOOGLE_SHEETS.md](./docs/GOOGLE_SHEETS.md) — CSV export covers launch.                                                           |
| **Analytics provider**       | `src/lib/analytics.ts` is a working no-op facade. Connecting a privacy-conscious provider is a config change plus a script tag.                                                |
| **CAPTCHA**                  | Only if abuse appears. `parseWaitlistFormData` already has a `bot` outcome to extend.                                                                                          |
| **Shared rate limiter**      | Current limiter is per-instance. Move to Upstash or a Postgres counter if the in-memory window proves insufficient.                                                            |
| **Legal review**             | Privacy and Terms are clearly-labelled drafts. Recommended before broad commercial launch.                                                                                     |
| **Generated Supabase types** | `src/lib/supabase/types.ts` is hand-written; regenerate from the real project.                                                                                                 |
| **Real social links**        | Footer intentionally has no social placeholders. Add only when accounts exist.                                                                                                 |

## Dependency advisories

`npm audit` reports high-severity advisories in `brace-expansion` (via ESLint)
and `postcss` (via Next.js). Both are development/build-time transitive
dependencies, and `npm audit fix --force` would downgrade Next.js to v9.
Deliberately not applied; re-check when Next.js and ESLint publish updates.
