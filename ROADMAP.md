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

## ✅ One-page sign-up, and a documentation truth pass

Sign-up asked for an address and a password, then sent the new player to a
success screen with a LINK to "choose my username". The founder walked his
own flow and named it: "this should all be on one page." Address, password,
name and handle together now, website and app, with the handle deriving from
the name until it is touched. Choosing a handle IS the setup step, so an
account made this way is marked set up on creation; an invited account still
walks the wizard, because nobody has been there to answer.

Auditing the setup flows meant reading what the repo claims about them, and
several statements had gone false: ARCHITECTURE.md still described
`display_name` as unique and registration as closed, and called setup two
steps; PRODUCT.md's status said matching and trading were not built. Both
corrected, along with three code comments and the admin console still saying
"invite-only".

Also found by reading rather than by a report: a player invitation emailed
them "Zach is in the CardFlare beta" — the store's sentence with a person's
name in it. The player flavour has its own subject and headline now, and a
test pins the store wording so fixing one cannot move the other.

## ✅ Card art CardFlare hosts, and a door for sets no provider carries

OP-17 exists as spoilers months before any API has it. Collection happens on
a laptop (`scripts/scrape-set.mjs`, discover then collect) and what reaches
the server is data, checked at the door — a fan site's redesign must not
become our outage. A private `card-art` bucket, a serving route on our own
origin with a year-long immutable cache, and an importer at
`/admin/cards/import` that writes rows under the manifest's own provider key,
so the whole import is reversible in one click the day a provider ships the
set properly.

`image_url` gained a second legal shape for this, which is the risky part, so
it is checked three times: the database constraint, the render gate and the
serving route. The migration probe earned its keep on the first draft —
`/api/card-art/../../etc/passwd` walked through a character class that had to
contain a dot for the file extension.

Three faults came out of the founder's real import and are fixed: two hundred
pictures in one form post exceeded the 1MB Server Action cap (each picture is
its own request now, with progress, and resumable because the bucket is the
record); an imported set could not be removed; and the picker made him select
every file rather than the folder.

## ✅ A handle to be found by, a name to be seen as

`players.display_name` was one column doing two jobs — one person on the whole
platform could be called "Zach" and everybody after them was refused. The
founder asked about Discord-style discriminators; Discord dropped those in
2023 because you cannot say "Zach#62847" across a shop counter, and what they
moved to is what this does. A unique lowercase `handle` carries identity;
the name is free to repeat, carry spaces and change.

Existing accounts were backfilled from their names ("Steven B" → `@steven_b`),
oldest keeping the plain handle, a number only where two genuinely collide.
Probed on real PostgreSQL against a roster built to break it. The rule is
stated three times — web, app and SQL — so a unit test walks two of them and
the probe runs the third.

## ✅ The Feed replaces Join

The left tab was a Join button for a QR scan that the room already offers.
The Feed answers "is anything worth my Friday?" from things CardFlare already
knows: somebody you follow needs a card you are holding, a board is open near
you, people you follow added cards, a trade happened at your store, and
players worth following because their binder answers your want list. No
photos, no captions, no comments, no compose box — see PRODUCT.md.

Ordered from things that go stale to things that do not. Both platforms, same
five kinds, same wording.

## ✅ One room identity per account (duplicate join)

An account could hold two room identities and appear twice on a board.
`player_sessions` gained a partial unique index on `player_id`, with a
`merge_player_sessions` function folding binders, Flares, offers, memberships
and trades onto the survivor. The self-trade and self-offer cases were found
by the founder hitting `trades_not_self` on his own data, and the seeded probe
now reproduces them.

## ✅ Feedback round — pledges for anyone, with a count

Two founder rulings reshaped offers. First: anyone may pledge on any
Flare — the Milestone 7 rule that your binder or synced collection had
to hold the card is gone, because plenty of players know exactly what
is in the box at home without having typed an inventory in, and on an
early board "I got you, I'll bring it" is a promise about tomorrow.
The offer cap still keeps one name off every Flare. Second: a pledge
can say how many. `flare_responses.quantity` (default 1, checked
1-99, probed on real PostgreSQL 16) rides the whole chain, and the
founder's example is the spec: Damian asks for 2x Brook, Chunc
pledges one, and the board tells the whole room "1 of 2 spoken for.
Still needs 1 more." — so the next Brook holder knows their copy
matters, and once everything is pledged nobody wastes a trip. On the
web the offer form asks "How many" when the ask is above one and every
row shows the coverage line; carousel tiles carry a one-tap "I got
it" / "I got you" pledge and a "Needs N more" caption. The app
mirrors all of it with a stepper. Board surfaces also converged: the
store dashboard's event page gained the same carousel default and
stacked/carousel switch the room page has (it was stranded stacked on
desktop), and deck folders became captions on uniform tiles instead
of bordered chips, after the chip read as clutter.

## ✅ Feedback round — deck folders, and the board leads with the carousel

The founder's ask, in his own example: someone building an RG Luffy
needs fourteen cards, and fourteen loose rows bury both the deck and
everyone else's board. The answer is a label, not a decks table — an
optional "deck name" typed when posting a Flare (`deck_label` on
`flares` and `player_wants`, 1-40 trimmed characters or null, probed
on real PostgreSQL 16). Cards sharing a name gather under one named
folder inside the player's section, on website and app alike; folders
merge case-insensitively and keep the first spelling seen; loose cards
stay plain rows below. The name rides the saved want, so the whole
hunt re-posts as a folder at the next store, through every path —
form, app, RSVP, re-post panel. Both posting forms keep the typed
deck name after each post, so a fourteen-card deck is typed once.

The carousel view (shipped a round earlier: same board, same controls,
file-browser geometry switch) is now the **default** on both clients —
the stacked reading view is one tap away and the choice still sticks
on the app. Carousel cards also shrank (website rail 160px → 112px,
app 130 → 95) after field feedback that the first cut was so large it
defeated the point: a phone now shows about three cards per shelf.

## 🔶 Milestone 16 — Your locals (approved; phase 1 shipped)

The stores a player actually goes to, remembered — and, in later
phases, boards that fill up before anyone drives over. Approved shape:
Phase 1 saved stores; Phase 2 recurring store schedules (with a game
tag, hidden while there is one game) plus the early-board window with
"arriving" badges and no-show expiry; Phase 3 the one-tap RSVP that
posts a want list ahead; Phase 4 "I got you" pledges and the
night-before digest. The founder's Wednesday beta proved the thesis by
hand: he shared the link hours early and seventeen players knew what
to bring from home.

**Phase 4 (shipped, closing the milestone):** the bring-from-home
loop, both halves. Pledges: on an early board, an offer already was
one in everything but words, so the words changed tense - the button
reads "I got you. I'll bring it", the row reads "is bringing it to
the event", the away-right-now tag stays quiet before doors, and the
existing caps, notifications, withdraw and confirm machinery carry it
unchanged on website and app alike. And the digest: the first Flares
landing on an early board wake every player who saved that store as a
local (excluding anyone already on the board), each with their own
count - "5 cards are already wanted for Wednesday, and you own 2 of
them. Bring the binder." - recorded through the backbone with one
dedupe key per player per event, delivered by push and email, fired
lazily from all three posting paths (web form, app API, RSVP) so no
cron exists anywhere. One tiny migration extends the notifications
kind check; probed on real PostgreSQL 16. Seven new unit tests pin
the digest's dedupe, exclusions and empty-board silence.

**Phase 3 (shipped):** "I'll be there", one tap. A signed-in player's
locals now carry the next event's own code and whether its board is
already open; when it is, the account page, the `/join` page and the
app's Join tab grow an RSVP button that joins the early board under
the account's own name (creating the session cookie on the spot when
the browser has none) and posts every saved want in one motion, with
the board's duplicate rule keeping repeats harmless. Deliberately no
`event_rsvps` table: being on the board before doors IS the RSVP -
participation counts you among who is coming (lobby and quiet screens
and their API twins now say "N players are already on it"), leaving
the room takes it back, and phase 2's no-show expiry already cleans up
after anyone whose plans fell through. Four unit tests pin the action:
join+post, session bootstrapping from the account's display name, the
window guard, and the silent no-op for anyone without an account.

**Phase 2 (shipped):** the schedule and the early board. Events grew
"Repeats weekly" — one checkbox at creation, and every close (by clock
or by hand) settles the occurrence's debts: no-show Flares are
cancelled (a pre-posted Flare said "I am coming"; the board never
carries the claim past the night it was about) and a recurring
occurrence creates next week's draft, seven days later at the same
wall-clock time in the store's zone (`plusDaysInZone`, DST-proven by
test: 169- and 167-hour weeks across both changes). Racing sweeps
converge on one successor via an exists-at dedupe. And boards open
before doors: `stores.early_board_hours` (default 48, store-settable
Off/24/48/72/168 on the dashboard) puts a scheduled draft into a new
"early" room phase — joinable, postable, loudly bannered as "everyone
here is still on their way" on website and app alike, with the lobby
and quiet screens (and their API twins) advertising the upcoming board
so a pinned counter link never goes stale. Walk-in trading keeps
priority at the counter; the automated version of what the founder
did by hand at the 17-player Wednesday beta.

**Phase 1 (shipped):** `player_locals` — probed on real PostgreSQL 16
(RLS on, zero public grants, unique pair, both cascades verified).
Saved automatically and silently wherever a signed-in player meets a
store: the website join form, the room page's session claim, and the
app's join call. Surfaced with each store's pulse (live room now, or
the next scheduled event) on the account page and under the `/join`
form on the website, and as "Your locals" on the app's Join tab —
tap a local and you are in without a QR code. Removal everywhere
(server action on the web, `DELETE /api/v1/locals` for the app), both
scoped to the authenticated player. Guests see none of it, by design.

## 🔶 Milestone 15 — CardFlare in the pocket (the Expo app, phase 1)

The native client, living in `mobile/` in this repository — one review
flow, one set of conventions, and Expo's build service is happy in a
monorepo. Every request goes through the website's `/api/v1`, so the
app cannot drift from the site; the design tokens mirror the website's
`@theme` block, so it does not _look_ like a second product either.
Guests are untouched: scanning a counter code with a phone camera still
opens the website with nothing installed.

**Phase 1 (built):** Expo SDK 57 + TypeScript; navigation shell in the
site's dark skin; **Home** (scan or type a code first — the guest loop
leads here too — with the account snapshot below for people who have
one); **Scan** (QR → the poster's `/e/CODE` URL, first scan wins);
**Room** (join as guest or signed in, the board with per-viewer
matches, offers, "counter may have it", offer and we-traded actions,
polled on the website ticker's cadence with pull-to-refresh);
**Sign-in** (password grant against the same Supabase project, tokens
in the device keychain, silent refresh on 401); **Inbox** (the
notification backbone's rows, marked read on view); **push
registration** after sign-in into `POST /api/v1/devices`. Typechecks
clean; the web app's verify and e2e are untouched by the monorepo
addition.

**Phase 2 (shipped):** posting a Flare from the app — debounced catalog
search, printing choice (any by default), quantity, note, the same
server-side validation as the website — and **push delivery**: when the
backbone records a notification, every device the account registered
gets it through Expo's push service, with tokens the service disowns
("DeviceNotRegistered") pruned so a deleted app never gets paid for
again. Both `expo.extra` values are filled in (public by design), so
sign-in works out of the box.

**Phase 3 (shipped, the "wants follow you everywhere" pass):** the
saved-wants loop now closes in every venue kind, not just tournament
rooms. On the website, a signed-in attendee opening a card show's
`/e/CODE` page sees **"Your wants, in this hall"** — their standing
wants matched against every vendor's uploaded inventory at once, each
hit naming the booth and vendor, before they search for anything. In
the app, the Room screen greets a signed-in player with **"Still
hunting these from last time?"** — the wants they have not already
posted in this room, with one button that posts them all. Stores and
tournaments already flowed (post → want saved → trade clears it →
next room offers a repost); shows were the gap, and shows are exactly
where the vendor pitch lives.

**Phase 4 (shipped, field-debugged):** two founder-reported gaps. The
big one: on the founder's own network, every app request _with a body_
died in transit while bodyless requests sailed through — proven by the
in-app six-probe connection matrix (GET 200, POST-empty 200,
POST-with-body timeout under every content-type, DELETE-empty 200;
Safari fine, so it is the native path plus that network). The app's
writes now travel in an `x-cf-payload` header — URI-encoded JSON, pure
ASCII, tiny by construction — which every `/api/v1` write accepts via
`readJsonPayload` (header wins, body still parsed for every ordinary
client), and the connection test grew a seventh probe that verifies
the header arrives byte-intact. And parity: the app's card picker now
shows card art beside every search result, every printing renders
with its own artwork so an alternate art is chosen by eye (matching
the website's versions list), and the room board shows each Flare's
card image.

**Phase 5 (shipped):** rooms feel live, and versions speak the
website's language. The website's room ticker now re-renders every
twelve seconds instead of sixty — at a minute, an offer sat invisible
long enough that people reached for pull-to-refresh — and the app
polls at the same cadence. The `/api/v1/cards` picker now labels each
printing with the website's exact wording (`printingLabel`: set code
· rarity · variant · promo · SPR-style mark) instead of the bare set
code, so an alternate art says so in both clients. And the app's
search results grew the website's versions dropdown: unfold a card's
printings, each with its own artwork and that full label, and tapping
one picks the card with that printing already chosen.

**Phase 6 (shipped):** touch feel. Every touchable in the app now goes
through one `Tap` primitive — a finger landing squeezes the control
down a hair, release springs it back with a little overshoot, and the
completed tap lands a light haptic tick (`expo-haptics`; fired on the
tap, not on touch-down, so scrolling never buzzes). And card art
zooms: tapping any card image — board, search results, versions,
printing choices — opens it at a readable size with the card's name,
number and version on top, tap anywhere to dismiss, mirroring the
website's thumbnail zoom.

**Remaining:** EAS build + TestFlight when the founder's Apple
Developer enrollment clears — `mobile/README.md` has the exact
commands. Push end-to-end needs that development build; everything
else works in Expo Go today.

## ✅ Milestone 14 — the API the app talks to

The seam between the website and the native client: JSON routes under
`/api/v1/`, authenticated by the same Supabase account system the site
uses — the app sends its access token as a bearer header, the server
verifies it against the project on every request, and an authenticated
user is an API player only if a `players` row exists. Every route runs
the same lib functions the website's pages run, so the two clients
cannot drift.

**Phase 1 (shipped):** `GET /me` (the account snapshot: player, wants,
collection stat), `POST/DELETE /devices` (push-token registration —
upsert on the unique token so a reinstall or handed-down device moves
cleanly, unregister scoped to the caller's own rows), and
`GET/POST /notifications` (the inbox the backbone writes; mark-read
scoped to the caller). Nine unit tests pin the guards: identical 401s
without a verified token or without a player row, and every write keyed
on the authenticated player.

**Phase 2 (shipped):** the room loop. `GET/POST /rooms/[code]`
(resolve any code — room, show, lobby, quiet — and join: session
created on first join, its token returned exactly once for the app to
hold the way the website holds its cookie; renames edit in place so a
binder is never abandoned; a bearer-authenticated user's session is
claimed by their account at the door), `POST /rooms/[code]/flares`
(auto-saving the want for linked accounts), `POST/DELETE
/rooms/[code]/offers` and `POST /rooms/[code]/trades` (both wired into
the notification backbone), and `GET /cards?q=` (the picker's ranked
search, unauthenticated because the catalog is public). The room GET
returns the board with per-viewer matches — binder plus proven
collection printings — computed server-side exactly as the page
computes them. Eight more unit tests pin the guards: joining is the
only door, every write re-establishes membership from scratch, and the
join token is issued once.

## ✅ Milestone 13 — the notification backbone (the app track begins)

Decided by the founder: CardFlare gets a real App Store app, and the two
worlds coexist — guests keep scanning straight into the website with
nothing installed, while accounts gain a home that can reach them when
their phone is locked. The backbone ships first because it is
client-agnostic: every noteworthy event is recorded per _player_, and
delivery fans out over whatever channels the player has — email today
(Resend is live), the app's push tokens the day it registers them.

- **`notifications`** — the record and the app's future inbox: kind,
  display fields, a room path to open, `dedupe_key` unique so one
  underlying event notifies once (re-offering with a new message updates
  the room, never pings again). **`player_devices`** — where the app
  will register push tokens (unique per token, cascade per player).
  Both probed on real PostgreSQL 16 and locked to the service role
- **Two notifications, chosen for the moment the loop closes:** somebody
  offered on your Flare (title, their message, "open the room"), and the
  requester confirmed a trade with you. Guests are unreachable by design
  — their room page keeps polling — and the underlying write always
  succeeds regardless of delivery: nothing here throws
- Wired after `offerTradeAction` and `confirmTradeAction`; five new unit
  tests pin the rules (guest silence, dedupe silence, record-without-
  email for addressless accounts, partner-not-confirmer)

**The app track from here:** an authenticated JSON API over the existing
lib layer (the same guards Server Actions use, callable by a native
client), then the Expo app itself — sign-in, QR scan into rooms, push
registration — in its own repository, TestFlight before the App Store.
The website changes for none of it: same backend, same account, same
data on both.

## ✅ The collection learns printings (pilot bug)

Found on the first live test of the Collectr import: an alt-art Perona in
the file, a Flare for exactly that alt art on the board — and the room
said "you have another printing of this", because the import kept only
card numbers and the matcher refused to claim a printing it could not
prove.

- **Names are the proof.** Collectr's product name and the catalog
  provider's own printing name both come off the printed card; when they
  agree — "Perona (Alternate Art)" on both sides, case, spacing and
  punctuation conventions aside — the import pins the row to that
  printing, and a Flare naming it now matches **exact**. Nothing is
  inferred from suffixes: no name agreement, no pin, and the row stays
  printing-unknown with the same honest downgrade as before. Two catalog
  printings answering to one name is ambiguity and also stays unpinned
- `player_collection` gains a nullable `printing_id`; one row per
  (player, card, printing) with nulls not distinct, so a proven alt art,
  a proven base and an unproven remainder of the same card coexist.
  Probed on real PostgreSQL 16 (three-row coexistence, duplicate
  refusal both ways, printing-delete cascades only its rows, API roles
  hold nothing). Existing rows survive as printing-unknown — a
  re-upload resolves them
- Room matching consumes the proven printings directly; the offer path
  and the one-line room note are unchanged. Nine new unit tests pin the
  equality rule (with names from the real pilot file) and the
  per-printing aggregation

## ✅ Milestone 12 — the Collectr collection, imported and invisible

Asked for by the founder after the first test night, built the day the
first real Collectr export arrived (the same discipline as the TCGplayer
parser: no file, no parser). A player imports their collection once, and
rooms quietly flag the Flares they could answer — without the collection
ever appearing anywhere as a list.

- **Same parser, one alias.** Collectr's export turned out to be one
  header alias away from the TCGplayer parser ("Category" for the game
  column); card number, name and quantity already matched. The real
  file's quirks are fixtures now: the escaped-quote product name, the
  market-price header with the export date embedded in it, a PSA-graded
  copy and an ungraded one of the same number summing into one card
- **Prices dropped, again by construction.** The export carries three
  price columns; the parser never looks any of them up and its output
  shape has no field to carry one
- **Invisible on purpose.** The room shows the collection's owner one
  line under "What you brought" — "Your collection (77 cards) is along
  too" — and shows everyone else nothing at all. A thousand imported
  cards listed as "what you brought" would be exactly the redundancy the
  founder ruled out. The account page shows a stat line, not a list
- **It works by flagging Flares.** The board's cards are checked against
  the viewer's collection (the narrow way round, so a big collection
  costs a bounded query per render) and merge into the same match
  engine as the binder — printing-unknown, so a Flare that names a
  specific printing honestly downgrades to "other printing"
- **Offers now honour it.** The server-side "you must hold the card"
  check behind every offer accepts the imported collection as proof,
  binder first, collection second — guests resolve to no account and
  nothing changes for them
- Re-upload replaces everything, same as the store sync. Eleven new
  unit tests (parser fixtures from the real file, action guards, the
  offer path's collection fallback); the tables shipped with Milestone
  11's migration, so production needs no new SQL

## ✅ Milestone 11 — player accounts (invite-only), wants that follow you

Asked for by the founder after the first real test night: players wanted to
sign in so their wants survive the room closing, and to be offered "post
these Flares again?" at the next store. With one boundary set explicitly:
**accounts must never take over the flash-event flow.** Want a quick trade?
No need to make an account. Want your cards to follow you between stores?
Make one.

- **Guests stay the front door.** Scanning a QR and trading with nothing
  but a nickname works exactly as before — no sign-in wall, no "create an
  account" step anywhere in the join path. The only mention a guest sees
  is one quiet footer line on the room page ("have an account? Sign in —
  the cards you post here will follow you to other stores")
- **Accounts are a layer, not a replacement.** `players` links an auth
  user to a display name; `player_sessions.player_id` (nullable, on
  delete set null) attaches a guest session to an account when its owner
  is signed in — the session stays the unit of room participation, so
  room history, Flares and trades are untouched by accounts existing
- **Nobody manages a want list.** Posting a Flare while signed in saves
  the ask; confirming a trade on it clears it; walking into the next room
  offers to post what is still outstanding, one tap for the lot. The
  account page lists saved wants only for pruning (capped at 100; at the
  cap the Flare still posts and the bookkeeping silently skips)
- **Invite-only, admin-only.** `/admin/players` invites a player by name
  and email, reusing the operator invite machinery (same setup-link
  fallback while email sending is unconfigured); the console's Manage row
  gains a Players tile. Sign-in claims store and player invites alike, so
  one email can be an owner, a vendor and a player at once
- Schema (`players`, `player_invites`, `player_wants`,
  `player_collection` + sync record for Milestone 12, the session link
  column) verified against a real PostgreSQL 16: constraint bounds,
  cascade and set-null behaviour, the nulls-not-distinct want upsert,
  anon/authenticated lockout. Ten new unit tests guard the actions: the
  invite is admin-only, a re-post re-derives room membership from
  scratch, a want is removable only through its own player

**Deliberately not built yet:** the Collectr collection upload
(Milestone 12 — the tables and sync record already exist; the parser
waits on a real Collectr export file, same discipline as the TCGplayer
CSV), self-serve signup, and any account requirement anywhere in the
guest path.

## ✅ The poster is a PDF now (phones ruined printing)

Found by the founder printing from an iPhone: iOS Safari stamps its own
URL, date and page count onto the sheet and adds margins that pushed the
card onto a second page — and offers no setting to stop either. The
zero-margin CSS fix below holds for desktop browsers; no CSS reaches iOS.

- **`/poster/[code]` serves the sheet as a real one-page PDF**, drawn with
  pdf-lib from the same data: same trading-card anatomy, the approved mark
  embedded byte-for-byte, the QR drawn module-by-module as vectors from
  the same generator at the same error-correction level. One page because
  the page is declared, blank top and bottom because a PDF has no browser
  around it
- **"Download PDF" is now the first button under every poster**, with a
  note steering phones to it. The old print button stays for desktops,
  where the zero-margin CSS already prints clean
- Public like `/e/[code]` and by the same reasoning — the poster's whole
  job is to hang on a counter; exact-code lookup only, rate limited
- Verified by looking: generated PDFs for counter, event (long title,
  truncates with an ellipsis) — one page each — and the QR on the rendered
  PDF **decoded back to the join URL** with an independent reader. Ten new
  unit tests pin one-page-always (marathon names included) and the
  route's guards
- Follow-up tweak: the "Links to …" line under each poster is a real
  hyperlink now, with a "Copy link" button beside it that confirms with
  "Copied". Driven in a browser: the anchor resolves, and the clipboard
  read back the exact join URL

## ✅ Clean print: no browser header or footer on the poster

Asked for by the founder: the printed QR sheet carried the browser's own
furniture — date and title at the top, URL and page count at the bottom —
which has no place on a counter.

- The browser draws that furniture into the page margins, so the print
  styles now declare `@page { margin: 0 }` — nowhere to draw it, gone in
  every browser, no "headers and footers" checkbox for a store to find.
  Clearance from the paper edge comes from body padding instead: 12mm
  around the poster, 14mm on ordinary pages
- Caught in the act: the first version put the padding on `html` and
  `body` both, doubling it and pushing the card's bottom strip onto a
  second Letter page. Found by printing to PDF and looking — Letter and
  A4 now both come out as exactly one page with the full card on it
- The print-sheet tests now guard the new mechanism: zero page margin,
  millimetre clearance on the poster body, padding restored for plain
  pages

## ✅ One account, every console — the area switcher

Asked for by the founder: invite themselves as a store and a vendor with
the admin email, then swap between admin, store and vendor views from the
header instead of juggling accounts.

- **A dropdown in the shell header**, beside the email, listing every
  console the account genuinely has: "Admin console" plus one entry per
  store membership, labelled by kind ("Store · Grand Line Games",
  "Vendor · SlabCity Singles"). Hidden entirely for the common one-console
  account. Memberships, never impersonation — the founder becomes a store
  the same way any owner does, by claiming an invite, so what they test is
  exactly what a real operator gets
- **Self-invites claim themselves.** An invite is normally claimed at the
  next sign-in, but the admin is already signed in — so the admin layout
  claims any pending invite for their address on render, and the switcher
  picks the new membership up immediately
- **`/store` learned two things**: an admin with memberships is no longer
  bounced to `/admin`, and `?as=<storeId>` picks which of the account's
  stores to show — validated against the RLS-filtered membership list, so
  the parameter can never reach a store the account is not a member of
- Driven in a real browser: the three options render, picking one
  navigates, and the header survives 390px (the switcher shrinks; the
  wordmark and sign-out never give way)

## ✅ Rooms close themselves (bug fix)

Found by the founder: every test event was still "open" days after its
window. The lifecycle was lazy in exactly one place — a scan of that
store's counter code — so a room nobody scanned again stayed open forever.

- **`sweepStaleRooms`** now runs when the console or a dashboard renders:
  scheduled events past `ends_at` flip to closed (one guarded, idempotent
  UPDATE), and idle walk-in rooms close stamped with when trading actually
  stopped — the same close a scan would have applied, just not waiting for
  one. Counter codes are untouched: permanent, reopening on the next scan
- **An ended event's own code now closes it too.** `resolveCode` and
  `enterRoomByCode` both catch a stale-open scheduled event past its
  window, close it, and hand back a closed room — so the page says "this
  event has finished" and a join is refused, instead of the event code
  keeping a room alive beside the walk-in room the counter opens next
  (the split-room failure this module exists to prevent)
- Closing exactly at `ends_at`, no grace, on purpose: the counter code
  already stops routing to the event at that instant, and any overlap is a
  split room. A store that wants overtime sets a longer window
- Nine new unit tests; the bulk UPDATE probed against real PostgreSQL
  (closes the ended-open event; leaves running, draft and walk-in rows
  alone; idempotent on the second run)

## ✅ Admin console — the operator directory

Asked for by the founder: the stores-and-vendors page still read as two
piles; wanted a dropdown to pick between them and a search box to find an
operator fast — for their settings, their poster, their room.

- **One list, two controls.** A search box (name, contact email, city,
  region — case-insensitive) and a kind dropdown (all / game stores /
  card-show vendors) replace the fixed two-group layout. Filtering runs in
  the browser over the roster the page already has, so it is instant per
  keystroke; rows are sorted alphabetically because a directory is for
  finding a name you know, and each row carries a kind badge plus the live
  and Flares-out badges from before
- **The directory comes first.** Finding an operator is the page's job, so
  the list moved above the invite form
- Filter rules live in a pure module with eight unit tests; the search,
  dropdown, combined filtering and the no-match state were driven in a
  real browser at 390px

## ✅ Milestone 10 — the counter sells too (store singles sync)

Asked for by the founder, from store feedback: stores worry CardFlare
cannibalizes their singles case. Flipped: a store uploads its own TCGplayer
Pro inventory export, and a Flare in its room quietly says the counter may
have that card — every Flare becomes a potential store sale, including the
ones no player can answer.

- **The store's own file, never a scrape.** A seller's inventory export is
  their data; no third-party fetch, no ToS question. The parser is built
  against TCGplayer's documented export shape (RFC 4180, header aliases,
  BOM, quoted names) and waits on a real pilot file to become fixtures —
  same rule as the vendor CSV import we deferred until one existed
- **Prices are dropped at the door.** The export carries price columns;
  the parser's output shape has nowhere to put one and the tables have no
  price column, so a price cannot be stored even by mistake
- **One stat line, never a list.** The store sees "1,204 cards synced ·
  updated 9:15 AM · 37 lines not recognised" plus a sample of what fell
  out. Sold-out rows and other games are skipped on purpose, not counted
  as failures. A re-upload replaces everything — the export is the truth
- **"May have it", never "has it."** The board's line — "{Store} may have
  this single — ask at the counter" — promises only what a day-old sync
  can honestly promise, and appears on the player's room page and the
  owner's/admin's event snapshot alike. Matching is by exact card number
  against the catalog; no fuzzy guesses
- `store_singles` aggregates per card (bounded by the catalog, not the
  shelf) and was verified against a real PostgreSQL 16: quantity checks,
  one-row-per-card, replace semantics, sync upsert, store/card cascades,
  anon/authenticated lockout. 22 new unit tests across parser and action

**Deliberately not built yet:** automated fetch on a schedule (the manual
upload proves the value; a store-controlled feed URL or official TCGplayer
API access can replace the ingestion later without touching the matching),
and printing-level precision (the counter line answers "worth asking?",
which card-level answers fully).

## ✅ Admin console — a dashboard, not a scroll

Asked for by the founder: the console scrolled too long, the lists went "on
and on", and the numbers worth knowing — how many Flares are out — were
invisible without clicking.

- **The front page is now a glance.** A "Right now" row of stat tiles (live
  rooms, Flares out, players here now — all real and current) and a
  "Manage" row of three linked cards carrying their headline counts. The
  configuration and card-catalog sections stay; everything list-shaped
  moved off
- **The lists each get a page.** `/admin/stores` (invite form + the grouped
  operator list), `/admin/events` (create + full history with attendance),
  `/admin/shows` (create + all shows). Store rows now show
  "N Flares out" beside the live badge, so the number the founder wanted is
  visible without a click
- **Fixed a double app-shell.** The admin layout already wraps every
  `/admin` route in the signed-in chrome, but the show and store detail
  pages were rendering a second shell inside it — two headers, two sign-out
  buttons. Both now render bare content with a back link, like spot-check
  always did
- `countOpenFlares` counts open Flares per live room in one query; the
  glance row was previewed at 390px and 1024px per the dataviz stat-tile
  contract (label + value in text tokens, no fabricated deltas)
- **Every event page shows its room's cards** (follow-up ask). The event
  page each console row links to now carries the roster and the Flare
  board — for a live room, "In the room", the player's view verbatim; for
  a closed one, "How the board ended", the Flares still standing when the
  room closed. Same privacy line as everywhere: names and asks, never
  binders. Store owners see it too — it is their own room's public board

## ✅ Admin console — store pages, live rooms, invite dropdown

Asked for by the founder: the operators were "all just kinda on the page",
with no way to click into one, see its QR code, see who is running right now
or look inside a live room.

- **The operator list reads as two lists.** Game stores and card-show
  vendors group separately, every name links to `/admin/stores/[id]`, and a
  store with a room running right now carries a "Live · room name" badge.
  Liveness applies the same rules a scanned counter code does (doors-open
  lead for events, idle window for walk-in rooms) but read-only — closing a
  stale room stays with the scan path, so a console refresh never writes
- **A page per store.** A game store's page shows what is happening right
  now (roster with presence and open-to-trades, the Flare board), its
  printable counter-code poster, and its events with attendance. A vendor's
  page shows the booths they have claimed and their inventory, read-only,
  exactly as attendee search will find it
- **The room view is the player's view.** Names, Flares, open-to-trades —
  never anyone's binder. The admin sees what someone standing in the room
  sees, and no more; the page says so on its face
- **Invite form: the kind is a dropdown.** The lgs/vendor radio cards read
  as confusing; one labelled select with a hint line replaces them
- New `listLiveRooms` summary covered by seven unit tests alongside the
  resolver's; every new surface rendered at 390px and inspected (the badge
  row needed a wrap fix the screenshots caught)

## ✅ Landing page — one hub for stores and shows

Asked for by the founder: make the main page read as "the ultimate hub to
simplify trading, buying and selling at game stores and card shows."

- Hero, How-it-works, For-players, For-stores and the waitlist section now
  all name both venues; the For-stores section speaks to game stores **and
  show vendors** (two new benefit cards: upload before the show, buyers walk
  straight to your booth). The h1 and the "currently being built" honesty
  line are unchanged — those are pinned by e2e and true
- The waitlist gains a **"Card show vendor"** signup type
  (`20260812090000_waitlist_vendor_type.sql` adds the enum value; verified
  against a real PostgreSQL — a vendor signup inserts cleanly)
- No new claims: everything the page now says (booth numbers, slabs
  PSA/BGS/CGC, sessionless show search) shipped in Milestone 9
- Third pass: vendors get their own section and nav tab. "For Vendors" sits
  between For Players and For Stores (page and header both), carrying the
  "Every buyer in the room, pointed at you" pitch plus four cards — upload
  before the show, the sale finds you, slabs sell as slabs, one weekend at a
  time — and its own "Join the Vendor Pilot" CTA that preselects the vendor
  waitlist type. For Stores returns to pure game-store copy. The desktop nav
  now waits for the `lg` breakpoint (five links plus the CTA wrapped
  inside their tabs at `md`), so tablets use the disclosure menu
- Second pass on founder feedback — the first draft still read player-first.
  The hero now speaks to both sides ("Buyers stop searching. Sellers stop
  waiting."), the For-stores section leads with the sales mechanism ("Every
  buyer in the room, pointed at you" — demand reaches the vendor the moment
  someone scans in, instead of the buyer working the hall table by table),
  and the how-it-works coda flips the same search into a buyer delivered to
  a vendor's table

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
