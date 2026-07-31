# CardFlare — Roadmap

Milestones ship one at a time. Each one stops for approval before the next
begins. See [PRODUCT.md](./PRODUCT.md) for scope boundaries.

## ✅ Milestone 1 — Public splash page and waitlist

**Status: shipped and live at https://cardflare.gg.**

Verified in production by the project owner: signups persist to Supabase,
duplicates return the friendly response, and the waitlist is confirmed
unreadable through the public API (the anon key returns a permission error).

- Landing page: navigation, hero, how it works, for players, for stores,
  product preview, early access, waitlist, footer
- Design token system and reusable component library
- Secure waitlist backed by Supabase with RLS, validation, duplicate handling,
  rate limiting and honeypot
- Privacy and Terms drafts
- SEO, Open Graph, Twitter, robots, sitemap, icons, structured data
- Unit, integration and E2E tests
- Confirmation email for new signups (inert until a sending domain is verified —
  see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) step 11)

## 🚧 Milestone 2 — Foundations (in progress)

Shipped so far:

- Supabase Auth magic-link sign-in for stores; no passwords anywhere
- `admin_users`, `stores`, `store_members`, `store_invites` with RLS,
  verified against a real PostgreSQL instance
- Admin console at `/admin`: invite a store, see stores and pending invites
- Tokenless invitations, consumed on first sign-in against the verified email
- Branded store invitation email
- `/store` placeholder confirming a store is set up

Still to come in this milestone:

- Guest player sessions (join by QR, display name only, no account)

**Beta rollout decisions taken.** Invitations gate _stores_, not players: a
player at the counter must be able to scan and join in seconds, so gating that
behind an emailed invite would break the core loop exactly where it matters.
Admins can create events directly, so the first pilot needs nothing from the
store but a printed QR code, and store self-service can follow once a real
event has been observed.

## ⏸ Awaiting approval

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

| Item                         | Notes                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Google Sheets sync**       | Supabase stays the source of truth. See [docs/GOOGLE_SHEETS.md](./docs/GOOGLE_SHEETS.md) — CSV export covers launch.            |
| **Analytics provider**       | `src/lib/analytics.ts` is a working no-op facade. Connecting a privacy-conscious provider is a config change plus a script tag. |
| **CAPTCHA**                  | Only if abuse appears. `parseWaitlistFormData` already has a `bot` outcome to extend.                                           |
| **Shared rate limiter**      | Current limiter is per-instance. Move to Upstash or a Postgres counter if the in-memory window proves insufficient.             |
| **Legal review**             | Privacy and Terms are clearly-labelled drafts. Recommended before broad commercial launch.                                      |
| **Generated Supabase types** | `src/lib/supabase/types.ts` is hand-written; regenerate from the real project.                                                  |
| **Real social links**        | Footer intentionally has no social placeholders. Add only when accounts exist.                                                  |

## Dependency advisories

`npm audit` reports high-severity advisories in `brace-expansion` (via ESLint)
and `postcss` (via Next.js). Both are development/build-time transitive
dependencies, and `npm audit fix --force` would downgrade Next.js to v9.
Deliberately not applied; re-check when Next.js and ESLint publish updates.
