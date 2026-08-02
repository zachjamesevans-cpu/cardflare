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

## ✅ Milestone 2 — Foundations

- Supabase Auth magic-link sign-in for stores; no passwords anywhere
- `admin_users`, `stores`, `store_members`, `store_invites` with RLS,
  verified against a real PostgreSQL instance
- Admin console at `/admin`: invite a store, see stores and pending invites
- Tokenless invitations, consumed on first sign-in against the verified email
- Branded store invitation email
- `/store` placeholder confirming a store is set up
- Guest player sessions at `/play`: a display name and an httpOnly cookie, no
  account. The cookie carries a random token; the database stores only its
  SHA-256, so read access to the table cannot resume a session. Sessions expire
  after 30 days and renew on use.

Attaching a guest session to a specific event is Milestone 3 work, since events
do not exist yet.

**Beta rollout decisions taken.** Invitations gate _stores_, not players: a
player at the counter must be able to scan and join in seconds, so gating that
behind an emailed invite would break the core loop exactly where it matters.
Admins can create events directly, so the first pilot needs nothing from the
store but a printed QR code, and store self-service can follow once a real
event has been observed.

## ✅ Milestone 3 — Events

- `events` table with RLS: a store reads its own events, admins read all, and
  there are no write policies — verified against a real PostgreSQL instance
- Store dashboard at `/store`: create an event, see every event and its code
- Event page at `/store/events/[id]`: printable QR poster, join code, and the
  draft → open → closed lifecycle
- Printed join codes in Crockford's base32, so a misread `I` or `O` still
  resolves to the right room
- `/e/[code]` — where the QR points — and `/join` for players who cannot scan
- Admin console lists every store's events and can create for any store

Players can reach a room and see it; posting Flares and matching is Milestone 4
onward.

## ✅ Milestone 5 — Cards

- `cards`, `card_printings`, `card_aliases` with RLS and no policies, verified
  against a real PostgreSQL instance
- `CardProvider` interface plus a JSON provider and an idempotent importer —
  see [docs/CARD_DATA.md](./docs/CARD_DATA.md)
- Card identity separated from printing, so needing OP01-024 matches whoever
  holds it in any printing
- Ranked search tolerant of misspellings, exposed at `/cards`
- **No effect text and no artwork**, both deliberate. `image_url` exists and
  stays null until a provider is licensed to fill it; `capabilities.images`
  is the single gate

**Rebuilt in the card-catalog milestone**: provider-neutral `CardDataProvider`,
an OPTCG API adapter, exact/normalized name separation, three-valued printing
classification, sync bookkeeping, and images behind a feature flag. The mapping
was verified against a real `/api/allSetCards/` record on 2 August 2026; the
the promo endpoint's path was corrected from a guessed one and its shape
verified. DON!! cards are deliberately excluded: the provider's records carry
no card number and CardFlare does not invent one — supporting them needs a
schema change, costed in docs/CARD_DATA.md. A sync can be run from
**Admin → Card catalog** or from the command line. Artwork now renders:
the founder reviewed the provider's terms on 2 August 2026 and enabled
`NEXT_PUBLIC_ENABLE_CARD_IMAGES`, superseding the "no artwork" line above. See
[docs/CARD_DATA.md](./docs/CARD_DATA.md).

No card data ships in the repository, because wrong card data is worse than
none.

## ✅ Milestone 4 — Joining

- `event_participants` joins a guest session to an event, verified against a
  real PostgreSQL instance: rejoining is idempotent, deleting a session or an
  event clears the room, and a rename follows the player everywhere
- Scanning to being in the room is **one submission** — a new player types a
  name and is in; a returning player taps once
- Event lobby: who is here, present players first
- Presence via `last_seen_at` and a 15-minute window, refreshed at most once a
  minute. Not websockets: a store wants to know who is around, not who moved
  their thumb, and a polled timestamp survives a phone locking in a pocket
- Generated avatars — initials over one of six hues derived from the session
  id. Never uploaded, so there is no storage, no moderation surface, and
  nothing to license
- Stores and admins see live attendance on every event

**The core loop's first two steps now work end to end**: a store creates an
event, prints the sheet, and players scan into the room. Posting Flares is
Milestone 6.

## ✅ Milestone 6 — Lists

- `flares` holds a room's live requests; `player_cards` is the player's trade
  binder and follows them between events and stores. Both verified against a
  real PostgreSQL instance
- **`printing_id` is nullable and null means "any printing"** — which is what
  most requests mean. A player who wants the alternate art specifically can say
  so, and Milestone 7 can honour the difference instead of guessing
- **Flares are public in the room, Have Lists are private.** A public Have List
  broadcasts "this person is carrying a $200 alt art" to a room of strangers.
  When matching lands, the holder chooses to respond; they are never
  involuntarily advertised
- **The binder follows the player, not the event.** Scoping it per event meant
  retyping a binder at every locals — including the same store's next Friday —
  which would leave matching with nothing to match. It rides the 30-day player
  session, so no sign-in was added
- **One tap confirms it on arrival.** A portable list rots: being told "Zach has
  this", walking over, and finding he traded it last week costs more trust than
  never matching at all. Asked once per event, never again that night
- A private, read-time cross-reference marks the Flares on the board that the
  viewer can answer, so the Have List is useful before matching exists
- Adding the same card twice is a quantity change, not a second entry
- Caps of 30 Flares and 200 Haves per player per event, because the board is
  shared and one person can ruin it
- Notes are short free text, deliberately not a structured preference model —
  nobody has specified one, and a taxonomy would bake in guesses about how
  people trade

**The core loop now runs manually end to end**: a store creates an event, a
player scans in, posts what they need, and everyone in the room can see it.
Automating the cross-reference and notifying both sides is Milestone 7.

### Milestone 7 — Matching

Matching engine, realtime match notifications, structured meetup responses.

### Milestone 8 — Trades

Trade confirmation, quantity updates, trade history, event analytics.

## Deferred from Milestone 1

Tracked so they are not lost, none blocking launch.

| Item                         | Notes                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Google Sheets sync**       | Supabase stays the source of truth. See [docs/GOOGLE_SHEETS.md](./docs/GOOGLE_SHEETS.md) — CSV export covers launch.                                                                        |
| **Analytics provider**       | `src/lib/analytics.ts` is a working no-op facade. Connecting a privacy-conscious provider is a config change plus a script tag.                                                             |
| **CAPTCHA**                  | Only if abuse appears. `parseWaitlistFormData` already has a `bot` outcome to extend.                                                                                                       |
| **Shared rate limiter**      | Current limiter is per-instance. Move to Upstash or a Postgres counter if the in-memory window proves insufficient.                                                                         |
| **Legal review**             | Privacy and Terms are clearly-labelled drafts. Recommended before broad commercial launch.                                                                                                  |
| **Generated Supabase types** | `src/lib/supabase/types.ts` is hand-written; regenerate from the real project.                                                                                                              |
| **Real social links**        | Footer intentionally has no social placeholders. Add only when accounts exist.                                                                                                              |
| **Display name moderation**  | Names are bounded and stripped of control, bidi and zero-width characters. That is not moderation. A reporting path belongs with Event Rooms, where there is a room to remove someone from. |
| **Provider terms review**    | Reviewed by the founder on 2 August 2026; images enabled on that basis. Re-check if the provider changes terms or if artwork is used anywhere beyond thumbnails on `/cards`.                |
| **Card data coverage**       | The importer exists; the full One Piece pool has not been loaded. Needs a source whose terms permit it.                                                                                     |
| **Realtime presence**        | Presence is a polled `last_seen_at` window, so the lobby updates on load rather than live. Supabase Realtime belongs with match notifications, where latency actually matters.              |
| **Event timezones**          | Events are stored as UTC instants and rendered in UTC, labelled as such. Correct but not friendly: a store reads its own schedule in local time. Fix before a pilot outside one timezone.   |
| **Expired session cleanup**  | Expired rows are ignored on lookup but not deleted. One scheduled `delete` — see the migration. Not urgent at pilot volume.                                                                 |

## Dependency advisories

`npm audit` reports high-severity advisories in `brace-expansion` (via ESLint)
and `postcss` (via Next.js). Both are development/build-time transitive
dependencies, and `npm audit fix --force` would downgrade Next.js to v9.
Deliberately not applied; re-check when Next.js and ESLint publish updates.
