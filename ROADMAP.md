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

## ✅ Milestone 6.5 — Store rooms

Asked for by a pilot store: printing a fresh sheet for every Friday is work,
and the sheet is useless on the six other days.

- **A permanent Counter Code per store**, minted with the account. Printed
  once, laminated, left on the counter
- **Two code spaces separated by length** — seven characters for a store, six
  for an event. Two unique indexes would still allow a birthday collision
  between the tables, and the failure would be silent: a laminated code
  quietly resolving to a stranger's event
- **One code, whichever room is live.** A running scheduled event always wins,
  including two hours before doors, so tournament night never ends up with
  half its players in a separate room. That split is the one failure this
  cannot have, and it is pinned by tests
- **Walk-in rooms open on a join, not on a page view**, so glancing at the
  counter code never leaves an empty session in a store's history
- **A quiet room closes itself** after six hours — longer than a slow
  afternoon, shorter than a night, so a room spans a day of trading and never
  spans two. A closed room's Flares stay with it; the next scan starts fresh
- One open walk-in room per store, enforced by a partial unique index rather
  than by the application. Two simultaneous scans cannot split the room; the
  loser adopts the winner's
- A switch in the store dashboard for stores that only want rooms during their
  own events. Turning it off ends the current room rather than leaving one
  running behind a control that says "off"
- Verified against a real PostgreSQL instance: the backfill, every new
  constraint, the race guard, and the close-then-reopen cycle

## ✅ Milestone 6.6 — Operator sign-in

Asked for by the founder: `/admin` bounced him to the marketing site from his
phone, and needing a fresh emailed link every time is friction in the wrong
place for the people who run events.

- **Sessions now survive.** There was no proxy, so a rotating refresh
  token was spent during page renders and its replacement discarded — a Server
  Component cannot write cookies. Operators were signed out about an hour after
  signing in, and a signed-in admin could read as a stranger and get bounced
  off `/admin`. Both were one missing file
- **Email and password sign-in**, with the emailed link kept as the recovery
  path — an invited account has no password, so the link is how the first one
  gets set. `/login/reset` is both "forgot mine" and "set my first"
- **An account area** at `/account` for changing a password and signing out
- **Google and Apple wired end to end**, rendered only where `AUTH_PROVIDERS`
  says a provider is actually configured. Nothing dead ships; turning one on
  later is credentials plus one variable
- **No new way to get an account.** Password sign-in, reset and the magic link
  all refuse to create one — an admin inviting a store is still the only path
- Ten-character minimum, seventy-two-character maximum, rate limited per IP
  _and_ per address, and one failure message for every kind of failure so the
  form cannot be used to enumerate pilot stores

**Deliberately not built:** usernames (Supabase Auth is email-based; a real
handle needs a profiles table, uniqueness and case-folding rules, and a
username→email lookup), public self-service signup, and MFA. The first two were
declined by the founder; MFA belongs with a larger admin-hardening pass.

## ✅ Milestone 6.7 — Open to trades

Asked for by the founder, from his own experience as a newer player: most of a
room is not hunting a specific card, and somebody who has never seen half of
what is in the binders around them cannot name what they want.

- **A flag on `event_participants`, not a card-less Flare.** A Flare is a
  request for a card; making `card_id` nullable to hold "nothing in particular"
  would weaken a constraint that carries meaning and put a non-card into a list
  built to show cards. Being open to trades is a property of a person in a
  room, and that table is exactly the row that says so
- **Per room, so it expires by itself.** Somebody can be up for anything at
  Friday locals and heads-down at a tournament, and leaving the room drops the
  row — no stale signal, and no confirmation step needed to fix one
- **They appear on the Flare board**, including with nothing posted. That board
  is the one surface everyone reads, and being absent from it was worst for
  exactly the player this is for. Listed after everyone with a specific
  request, since a named card is easier to act on
- **A card of their own** — `OpenToTradesCard`, built to the same box, radius
  and inner frame as the placeholder so it reads as part of the same family.
  Two crossing arrows and no text: at the 56px a phone renders it, a label
  would be unreadable, which the "any printing" marker already taught
- Public to the room, deliberately, unlike the Have List. It is an invitation
  to come over rather than a disclosure of what somebody is carrying
- Verified against a real PostgreSQL instance: the default is false so nobody
  is silently broadcast, the partial index is the one the planner picks, and
  the flag leaves with the participant row

## ✅ Milestone 6.8 — Store timezones

Deferred since Milestone 3 with the note "fix before a pilot outside one
timezone". It turned out to be worse than the display problem it was filed as.

- **The typed time was being misread, not just mislabelled.** `datetime-local`
  submits "2026-09-12T18:00" with no zone, and `Date.parse` reads a bare string
  like that in the server's zone — UTC on Vercel. A store owner in Austin
  typing 6pm stored one in the afternoon, and the dashboard then displayed that
  wrong instant accurately as "6:00 PM UTC"
- **`stores.timezone`**, defaulting to UTC so nothing moves under an existing
  store until it says where it is. Times stay `timestamptz`: an instant was
  always the right thing to store, the zone was what was missing
- Conversion in `src/lib/time/zone.ts`, on `Intl` rather than a date library.
  Two passes, because a single-pass conversion is an hour wrong for the few
  hours after a daylight-saving change — a store opening early on the Sunday
  the clocks go forward would have printed the wrong time on its counter sheet
- Ordering and duration are checked on the converted instants, not the typed
  strings: twenty-five wall-clock hours across the autumn change is
  twenty-six real ones
- The zone comes from the store row and never from the form, the same way the
  store id is authorised against the session rather than trusted
- Displayed with the abbreviation a person would say — "CDT", not
  "America/Chicago" — which also changes with the season, so it quietly
  confirms the daylight-saving side is right

## ✅ Milestone 6.9 — One-email store invitations

Asked for by the founder: "it's a little convoluted to get an email saying that
they then have to get ANOTHER email just to set/reset their password."

- **One email, not two.** The invitation used to point at a form that asked for
  the address it had just been sent to, so a second email could carry the link
  that actually did something. The first email did nothing but ask for a click
- **Still no homegrown token.** `generateLink()` mints a Supabase token
  without sending anything; the invitation carries it in a cardflare.gg URL
  redeemed by `/auth/confirm`. `recovery`, not `invite` — the auth account
  already exists by then, and an invite link would try to create it and fail
- **`/welcome`** shows the address they were invited on and asks for a password
  and a confirmation. Nothing that is already known is asked for again
- **Expiry is treated as the common case.** These links last an hour by
  default and a shop owner reads email the next morning, so every failure path
  lands on `/login/reset?expired=1` — which says the link expired and is one
  field from a fresh one. Not `/login`, which asks an invited store for a
  password they do not have yet
- **The fallback is honest.** When the link cannot be minted, the invitation
  still sends and its copy changes to describe the two-step route rather than
  promising a button that is not there. Rendering both messages side by side is
  what found that they were byte-identical, telling the reader that if the
  button had expired they should visit the URL the button already pointed at
- Two bugs found by looking rather than reasoning: that one, and every form in
  the app emitting `errorid`/`hintid` attributes onto its inputs because
  `fieldIds()` returned three ids where only `id` belongs on a control
- `src/middleware.ts` is now `src/proxy.ts`, the convention Next 16 deprecated
  it in favour of

## ✅ Milestone 6.10 — Feedback round: invite link, board toggle, header sign-in

Three founder asks after using the beta, plus one bug caught by re-checking
the flow before it was merged.

- **The invitation's link now survives any device.** The first cut emailed
  Supabase's `action_link`, which only hands a session to the browser that
  requested the link — and the requester was the admin's server, so the link
  would have died on every shop owner's phone. The email now carries a
  cardflare.gg URL built from the `hashed_token`, and a new `/auth/confirm`
  route redeems it with `verifyOtp`, which needs no prior contact with the
  site. A side benefit: the button no longer points at `<ref>.supabase.co`,
  and Supabase's Redirect URLs allowlist is no longer involved
- **"Open to trades" moved to where the thought happens.** It was its own card
  higher up the room page, and feedback was that nobody connected it with
  posting. It now sits directly under the Post-a-Flare form as the other
  answer to the same question — "I don't know what to search for" — restyled
  as one compact row that lights up while you are on the board
- **Store sign-in moved to the header**, desktop nav and phone menu both, so
  an owner is not scrolling past the whole landing page to get in. Removed
  from the footer rather than duplicated. Still "Store sign-in", never
  "Sign in" — a player must not conclude they need an account

## ✅ Milestone 7 — Matching

The core loop closes: the room now tells both sides. Until this, the
cross-reference only whispered to the holder ("you have this") and the
requester found out when somebody happened to walk over.

- **The matching engine honours printings now**, paying off the IOU Milestone
  6 left. A Flare for the alternate art matches a binder's alternate art as
  "you have this"; the base art — or a binder entry that named no printing —
  shows as "you have another printing" instead of being rounded up. One wrong
  "you have this" costs more trust than ten missed matches
- **Offers.** On a Flare you can answer, one tap — plus an optional "table
  12" — puts your name under that Flare for its author: `flare_responses`,
  verified against a real PostgreSQL instance. The requester sees who, where,
  and whether they are still present; a summary at the top of the room links
  to their offers. Withdrawing deletes the row; leaving the room hides your
  offers until you return
- **The privacy line holds.** An offer carries nothing from the binder — not
  the printing, not the quantity. The room learns you can help only when you
  choose to say so, which was the deal since Milestone 6
- **You must carry the card to offer.** The button renders only on a match,
  but the server re-checks the binder — a Server Action is a public POST
  endpoint, and without that check offers become a way to put your name on
  every Flare in the room. Capped at 30 open offers per room, same shape as
  the Flare cap
- **"Realtime" is a one-minute poll, on purpose.** The room re-reads itself
  while the tab is visible and refreshes on return from a pocket — which
  also keeps presence honest. The plan said "realtime match notifications";
  what a physical room actually needs is "fresh by the time you look", and a
  websocket buys seconds of latency on a signal whose response is a walk
  across the room, at the price of connection management on locked phones on
  shop wifi. Supabase Realtime is ruled out anyway by RLS-with-no-policies
- **Structured meetup responses stayed unbuilt**, same reasoning as note
  taxonomies: nobody has specified the structure, and "where to find you" as
  free text is what a player would have typed into any structure we invented

## ✅ Milestone 8 — Trades

The tally that says the loop actually closed. A trade is written once, by the
Flare's author, when the cards change hands — a mark with names on it, and
deliberately nothing more: no prices, no escrow, no marketplace mechanics,
per PRODUCT.md.

- **Confirming from an offer** — "We traded" on the offer row — records the
  partner and closes the Flare. The offer is what entitles a name to appear
  in someone else's history: without a standing offer, a confirm cannot name
  you, so nobody can be written into a trade they never acknowledged
- **Confirming without an offer** — "Traded it? Mark it done" — records a
  partnerless trade, because somebody reading the board and just walking
  over is the core loop working, and the tally must not miss it
- **Retry-safe by construction.** The trade row is written before the Flare
  closes, and the one-trade-per-Flare index turns a retried confirm into
  "already recorded". A half-completed confirm can under-close, never
  double-count. Verified against a real PostgreSQL instance, along with the
  self-trade check and the deletion semantics
- **History survives its pointers.** Sessions expire in 30 days by design;
  a store's numbers must not shrink as they do. Session, Flare and printing
  references go null on deletion — only the event takes its trades with it
- **"Traded tonight"** shows each player their own night, both sides, in the
  store's timezone. Private: the store sees totals, never who traded what
- **The binder nudge.** After a trade in which you were the holder, the room
  asks about exactly that card — "still have it?" — one tap to remove it or
  vouch for it. Driven entirely by `confirmed_at` timestamps that already
  existed; "still have it" is a per-entry re-confirmation, so there is no
  new state anywhere
- **Event analytics** on the store's event page: players joined, Flares
  posted, still wanted, offers made, trades made. The funnel says where a
  night stalls; the trades number answers "was it worth hosting". Counts
  only — no prices, and never who traded with whom

**Deliberately not built:** two-sided confirmation (the author confirms, the
history shows both — a second tap from the partner adds ceremony to a trade
that already happened across a table), automatic binder decrementing (the
binder is the holder's private statement; the nudge asks rather than edits),
and per-trade quantity adjustment (a partial fill is a re-post, which the
upsert already handles).

## ✅ Post-milestone polish — card search declutter

Founder feedback with screenshots: "the cards are kinda all scattered."

- **One card, one row.** A result shows the base art, the name, and a single
  quiet meta line — number, type, colours. Alternate arts and promos collapse
  behind "N versions — alt arts and promos", expanded on a tap. Which card is
  the list's question; which version is the Flare form's, and it already asks
  it properly after picking
- **The floating debris had one root cause.** `cn` is a plain string join
  with no conflict resolution, so `CardThumbnail`'s built-in `w-14` fought
  every caller's smaller width and stylesheet order picked the winner — the
  "small" printing chips had been rendering at full size all along.
  `className` now replaces the default width instead of joining it
- The type/colour badges no longer float in their own right-hand column, and
  rarity is no longer printed twice
- **Tapping a version picks it** (second round of the same feedback). In the
  Post-a-Flare search, a tap on an expanded version selects the card with
  that printing already chosen in the form — nobody finds the alternate art
  twice. A plain row tap still means "any printing", which stays the default
  ask, and a preselected version gets a hint under the dropdown pointing back
  to it: any printing is the ask more people can answer. On the public
  `/cards` page (same component) the versions stay informational — there is
  nothing there to pick for. Driven end to end against a mock PostgREST:
  version tap arrives in the form as that printing, plain tap as "any"

## ✅ Milestone 9 — Card shows

Asked for by the founder: "card show attendees pull up, scan the QR code,
enter the cards they're looking for — and it finds the vendors that have
them and which booth they're at."

- **A second kind of operator, one pipeline.** `stores.kind` splits `lgs`
  from `vendor` at the invitation — the admin picks with a radio, the email
  says the right thing to each, and everything else (one-email setup,
  `/welcome`, sign-in) is reused untouched. A vendor's dashboard is
  inventory and booths; no rooms, no counter code
- **Shows are the third code length.** Eight characters, extending the
  split-by-length namespace (six = event, seven = counter), so the one
  `/e/CODE` route serves all three and nothing is ever told apart by a
  lookup. Admin creates a show with a weekend-long window in the venue's
  timezone; the poster prints from the same trading-card sheet
- **Inventory speaks vendor: raw and slabs.** A line is a raw single or a
  graded slab — PSA, BGS, CGC, 1–10 in half steps, or "Authentic" with no
  number. The same card raw, as a PSA 10 and as a BGS 9.5 is three lines,
  because those are three different reasons to cross a hall. Restating a
  line replaces its quantity. **No prices anywhere**, per PRODUCT.md
- **Booths are claimed, not assigned.** A vendor claims (or moves) their
  booth per show from their dashboard; leaving hides their stock from that
  show without touching the stock itself. The admin's show page is the
  roster
- **The attendee path is sessionless.** Scan, type, read booth numbers — no
  account, no join step, nothing written. Results sort by booth as a
  walking route, slabs first, best grade first, and inventory from a vendor
  not on this show's roster is invisible at this show
- Verified against a real PostgreSQL instance (slab rules, booth shapes,
  upsert semantics, roster cascade), and driven end to end against a mocked
  Supabase API: scan → "perona" → Booth A12 raw ×4, Booth B7 PSA 10 + BGS
  9.5 ×2

**Deliberately not built:** CSV inventory import (until a real vendor's file
is seen — a guessed column mapping that mislists someone's stock is worse
than an evening of tapping), attendee want-lists at shows (search-first ships
tonight's value; persistence can follow observed use), and vendor
self-signup (invites gate operators, same as stores).

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
| **Expired session cleanup**  | Expired rows are ignored on lookup but not deleted. One scheduled `delete` — see the migration. Not urgent at pilot volume.                                                                 |

## Dependency advisories

`npm audit` reports high-severity advisories in `brace-expansion` (via ESLint)
and `postcss` (via Next.js). Both are development/build-time transitive
dependencies, and `npm audit fix --force` would downgrade Next.js to v9.
Deliberately not applied; re-check when Next.js and ESLint publish updates.
