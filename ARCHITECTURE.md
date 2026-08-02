# CardFlare — Architecture

## Stack

| Concern         | Choice                             | Notes                                         |
| --------------- | ---------------------------------- | --------------------------------------------- |
| Framework       | Next.js 16 (App Router, Turbopack) | Server Components by default                  |
| Language        | TypeScript, `strict: true`         |                                               |
| Styling         | Tailwind CSS v4                    | Tokens in `@theme`, no config file needed     |
| Database        | Supabase (PostgreSQL)              | Source of truth                               |
| Validation      | Zod v4                             | Shared by client hints and server enforcement |
| Icons           | lucide-react                       |                                               |
| Unit tests      | Vitest                             |                                               |
| E2E tests       | Playwright                         | Mobile + desktop projects                     |
| Hosting         | Vercel                             |                                               |
| Package manager | npm                                |                                               |

**Deliberately not used:** Prisma (Supabase migrations plus a typed schema
mirror are sufficient), React Hook Form (a Server Action with `useActionState`
covers a single form with less client JavaScript), any animation library.

`qrcode` is the one dependency added for a thing that could in principle be
hand-written. Reed–Solomon encoding and QR version selection are not worth
reimplementing, and a subtly wrong QR fails on paper rather than in a test.

## Directory layout

```
public/brand/          Approved logo master and web derivatives
scripts/               Brand asset generation
src/app/               Routes, metadata, icons, OG image
src/components/
  app-preview/         Marketing previews of the future app UI
  brand/               Logo
  layout/              Header, footer, mobile nav, legal shell
  marketing/           Landing page sections
  ui/                  Design system primitives
  waitlist/            Waitlist form and success state
src/lib/
  auth/                Session, viewer roles, guards, sign-in actions
  email/               Provider client and message templates
  cards/               Card provider interface, importer, search
  events/              Event Rooms: schema, repository, actions, join codes, QR,
                       and rooms.ts — what a scanned code resolves to
  players/             Guest sessions: schema, repository, cookie, actions
  stores/              Store invitation schema, repository, actions
  supabase/            Browser/server/service-role clients and schema types
  waitlist/            Schema, parsing, repository, server action
supabase/migrations/   SQL migrations
tests/unit/            Vitest
tests/e2e/             Playwright
```

## Rendering model

Everything is a Server Component unless interactivity forces otherwise. The
only Client Components are:

| Component            | Why it must be client-side                     |
| -------------------- | ---------------------------------------------- |
| `MobileNav`          | Disclosure state, Escape handling              |
| `WaitlistForm`       | `useActionState`, inline errors, success state |
| `PasswordSignInForm` | `useActionState`, inline errors                |
| `ResetRequestForm`   | `useActionState`, inline errors, success state |
| `NewPasswordForm`    | `useActionState`, inline errors, success state |
| `JoinForm`           | `useActionState`, inline errors                |
| `JoinCodeForm`       | `useActionState`, inline errors                |
| `CreateEventForm`    | `useActionState`, inline errors                |
| `CardSearch`         | `useActionState`, inline results               |
| `JoinEventForm`      | `useActionState`, inline errors                |
| `PrintButton`        | Calls `window.print()`                         |
| `PlayerIdentityCard` | Rename disclosure state                        |
| `AnalyticsTracker`   | Page view and delegated click tracking         |

All routes prerender as static content. The waitlist submits through a Server
Action, so no API route is needed and no Supabase credentials reach the browser.

### Analytics without client boundaries

`AnalyticsTracker` attaches one delegated click listener keyed off a
`data-analytics-event` attribute. Adding tracking to a server-rendered CTA is
therefore an attribute, not a client boundary.

## Waitlist submission path

```
WaitlistForm (client)
  └─ submitWaitlist            Server Action — src/lib/waitlist/actions.ts
       ├─ parseWaitlistFormData   honeypot → timing → Zod   (form-data.ts)
       ├─ checkRateLimit          per-IP fixed window       (rate-limit.ts)
       ├─ isSupabaseConfigured
       ├─ insertWaitlistSignup    service-role insert       (repository.ts)
       └─ after(sendEmail)        confirmation, off the critical path
```

The layers are split so each is independently testable: `form-data.ts` is pure
and has no server-only imports, `repository.ts` is the only module that knows
about Supabase, and `actions.ts` holds the orchestration and request context.

### Why a Server Action rather than a route handler

One form, one destination, progressive enhancement for free, and no public
JSON endpoint to document or version. `parseWaitlistFormData` takes plain
`FormData`, so moving to a route handler later would not require rewriting the
validation.

## Security model

A Server Action is a public POST endpoint. Every submission is re-validated
server-side regardless of what the client did.

| Control               | Implementation                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| No client DB access   | Writes go only through the Server Action using the service-role key                                                      |
| Service key isolation | `src/lib/supabase/admin.ts` imports `server-only` — leaking it fails the build                                           |
| Row Level Security    | Enabled on `waitlist_signups` and `player_sessions` with **no policies**; privileges revoked from `anon`/`authenticated` |
| Bearer credentials    | The guest session token is stored only as a SHA-256; the cookie is `httpOnly`                                            |
| Input validation      | Zod on the server; the database repeats the checks as constraints                                                        |
| Mass assignment       | Fields are read by name; `status`, `id` and `created_at` are never client-settable                                       |
| Rate limiting         | 5 submissions per IP per 10 minutes                                                                                      |
| Bot filtering         | Hidden honeypot field plus a minimum fill time                                                                           |
| Error disclosure      | Database errors are logged server-side; users get a fixed generic message                                                |

Because RLS is on with zero policies, the table is invisible to the public
PostgREST API even if the anon key is published — which it is, by design.

### Defence in depth in SQL

The database re-checks what Zod already checked: email normalisation, email
shape, and every length bound. If a future code path inserts without going
through the action, the constraints still hold.

### Adding CAPTCHA later

`parseWaitlistFormData` already returns a `bot` outcome. A CAPTCHA becomes an
additional check in that function plus a token field on the form; nothing else
changes.

### Confirmation email

Sent through `after()` from `next/server`, so it runs once the response has
been delivered — the provider is never on the critical path, and a slow or
unreachable one cannot make the form feel broken.

Three properties are deliberate:

- **It fires only when a row was created**, never on a duplicate. That makes
  the email unrepeatable: resubmitting an address that already exists sends
  nothing, so the form cannot be used to flood a stranger's inbox.
- **It is scheduled outside the `try` that wraps the insert.** Inside, a throw
  from the email path would report a stored signup back to the visitor as a
  failure.
- **`sendEmail` never throws**, and the scheduled callback catches anything
  regardless, since it runs detached from the request.

Absent `RESEND_API_KEY` and `CARDFLARE_FROM_EMAIL`, sending is skipped and the
waitlist behaves exactly as before. The same pair governs store invites, which
is why the variable is named for the product rather than for the waitlist. The
client talks to the REST API with `fetch` rather than the SDK — one endpoint,
four fields, not worth a dependency.

### Known limitation: rate limiter scope

The limiter is in-memory, so under serverless fan-out it throttles per instance
rather than globally. That is an accepted launch trade-off — it stops a naive
flood at zero cost. Swap `checkRateLimit` for a shared store (Upstash, or a
Postgres counter) if abuse appears.

## Authentication and roles

Identity comes from Supabase Auth. Three ways in, all landing on the same
session:

| Method             | What it is for                                        |
| ------------------ | ----------------------------------------------------- |
| Email and password | The everyday way in                                   |
| Emailed magic link | First sign-in, and getting back in without a password |
| Google / Apple     | Built, and rendered only where actually configured    |

Passwords were added because the beta ran on magic links alone, and asking a
store owner to go to their inbox every time they wanted to open the dashboard
on a Friday night is friction in the wrong place. The link is still there and
still matters: an invited account exists with no password, so the emailed link
— or the reset link, which is the same mechanism — is how the first one gets
set. There is no separate activation flow to keep in step.

`getViewer()` resolves the caller to one of four shapes — `anonymous`,
`admin`, `store`, `unaffiliated` — and every guard derives from it. It calls
`getUser()` rather than `getSession()`: the latter reads the cookie without
verifying it, so it can be forged, and this result gates the admin console.

| Area       | Who reaches it                                                    |
| ---------- | ----------------------------------------------------------------- |
| `/admin`   | Accounts listed in `admin_users`                                  |
| `/store`   | Accounts with a row in `store_members`                            |
| `/account` | Anyone signed in                                                  |
| `/login`   | Anyone, but nothing is ever sent to an address without an account |

### Sessions, and why there is middleware

`src/middleware.ts` exists for one reason: Supabase access tokens last an hour
and renew with a _rotating_ refresh token, and the renewal only counts if the
new pair reaches the browser.

There was no middleware, so renewal happened during page renders — and a
Server Component cannot set cookies, so the `setAll` in
`src/lib/supabase/server.ts` caught the new pair and dropped it. Every render
spent the refresh token and discarded the replacement, invalidating the one the
browser still held. An hour after signing in, an operator was signed out. It
looked like a design choice ("sign-in is by emailed link") rather than the bug
it was.

It also made a signed-in admin read as a stranger: `getViewer` queries
`admin_users` through the user's own client, and a request carrying a spent
token reads nothing, so `requireAdmin` bounced them to the marketing site.

Middleware runs before the render and owns a real response, so the refreshed
cookies survive. It writes them to the request too — the render behind it reads
that copy, and without it the very render the refresh exists to serve would
still query as an expired user.

The matcher covers only `/store`, `/admin`, `/account` and `/login`. `getUser`
is a round trip to the auth server, and the pages where speed matters most —
the landing page, and `/e/CODE` reached by scanning printed paper on shop wifi
— have no session at all.

### Passwords

- **Ten characters minimum, seventy-two maximum.** Ten because six is not a
  password; seventy-two because bcrypt silently truncates past that, and a
  longer one would appear accepted while only its prefix was ever checked. No
  composition rules — they produce `Password1!` and are no longer recommended.
- **Rate limited twice.** Per IP catches one machine working a list; per
  address catches a botnet spread across many IPs guessing at one known store
  owner, which a per-IP limit does nothing about.
- **One failure message.** A wrong password, an unknown address and an account
  with no password yet are three different facts, and the form reveals none of
  them — otherwise it becomes a way to enumerate which stores are in the beta.
  Supabase's own wording is logged, never returned.
- **No "current password" field** on the change form. Somebody arriving from a
  reset link has no current password to type, and Supabase's own secure
  password change setting is the right place to require re-authentication.

### Social sign-in

Wired end to end, and rendered only for providers this deployment has
configured — `AUTH_PROVIDERS` names them, unset means none, and no button
renders otherwise. A "Continue with Google" button with no Google client
behind it is a dead control, which PRODUCT.md forbids.

Two steps that must agree, and only one is in this repository: the credentials
go in the Supabase dashboard, and `AUTH_PROVIDERS` claims what was configured.
There is no API that reliably reports which providers a project has enabled, so
the alternative to asking is guessing — and guessing wrong renders exactly the
dead button this avoids. The provider name arrives in a form field, so
`isProviderEnabled` re-checks it server-side before any flow starts.

**Admins are an explicit allow-list with no self-service path.** Rows go into
`admin_users` by hand, in SQL.

**Guards live in the action, not only the page.** A Server Action is a public
POST endpoint, so hiding a form hides nothing; `inviteStoreAction` re-checks
the viewer itself. The admin layout and the admin page each guard separately
too — a layout is not a security boundary, and a page added later should not
inherit the appearance of protection without the substance.

**Sign-in reveals nothing.** `shouldCreateUser` is off, and the response is
identical whether or not the address belongs to a store — on the magic-link
form, the password form and the reset form alike — so none of them can be used
to enumerate who is in the beta.

**No account is ever created by signing in.** Password sign-in cannot create
one, a reset cannot create one, and the magic link will not either. Accounts
come from an admin inviting a store, which remains the only path.

**Redirects are constrained to this origin.** `safeNextPath` rejects absolute,
protocol-relative and backslash-prefixed targets; without it `?next=` would be
an open redirect wearing CardFlare's credibility.

### Invitations

Deliberately tokenless. Supabase Auth already proves control of an inbox, so a
second homegrown secret would add cryptography to maintain without adding
security. An invite is a row keyed by email; on first sign-in the server
matches it against the address Supabase has verified, creates the membership,
and marks the store active. Consumed with the service role, because
`store_invites` is unreadable through the public API.

Re-running is harmless — it is a no-op once accepted — so a failed membership
insert simply retries on the next sign-in.

### Row Level Security

Policies key off `auth.uid()` through two `SECURITY DEFINER` helpers,
`is_admin()` and `is_store_member()`. They exist because a policy on `stores`
that queried `store_members` directly would trigger that table's own policies,
which reference `stores` — infinite recursion. Both pin `search_path`, since a
definer function resolving names through the caller's path is an escalation
route.

There are **no insert, update or delete policies anywhere**. Every write goes
through the service role after an application-level authorisation check. A
store can read its own row and nothing else; it cannot edit even that.

Verified against a real PostgreSQL instance: a store owner sees only their own
store, cannot read the admin list or invitations, cannot edit their store, and
cannot promote themselves to admin.

## Guest player sessions

A player at a counter has to be in the room in seconds, so players get an
identity with no account: a display name and a cookie.

```
JoinForm (client)
  └─ joinAsPlayer              Server Action — src/lib/players/actions.ts
       ├─ displayNameSchema       collapse → bound → reject unsafe characters
       ├─ checkRateLimit          20 per IP per 10 minutes
       ├─ createPlayerSession     service-role insert of the token's hash
       └─ setPlayerCookie         httpOnly, secure, sameSite=lax, 30 days
```

The cookie holds a 32-byte CSPRNG token; `player_sessions` stores only its
SHA-256. Possession of the token _is_ the authorisation — there is no
`auth.uid()` to key a policy off — so RLS is on with **zero policies** and
every access goes through the service role, exactly like the waitlist. Read
access to the table therefore cannot resume anyone's session.

Rename and leave resolve the session from the cookie, never from an id in the
request, so neither can be pointed at another player's row.

The limit is 20 joins per address per 10 minutes rather than the waitlist's 5:
a whole store shares one network, and a queue of players scanning the same code
must not lock each other out.

Sessions expire after 30 days and are renewed at most once a day on use, so an
active player is never signed out mid-event while a borrowed phone does not
keep someone else's name indefinitely.

Display names are bounded, whitespace-collapsed, and stripped of control, bidi
and zero-width characters — a bidi override would let a name render as
something other than what is stored. That is not moderation, and none is
claimed; see ROADMAP.md.

## Design system

`src/app/globals.css` `@theme` block is the single source of truth for colour,
radius, shadow, and motion. Components reference tokens
(`bg-accent`, `text-text-secondary`, `rounded-[var(--radius-card)]`) and never
literal hex values. Changing the CardFlare accent is a one-line edit.

`tests/unit/design-tokens.test.ts` parses that CSS and asserts every text and
status pairing meets WCAG AA, so a palette change that breaks contrast fails
the build rather than shipping.

One exception is documented in the file that needs it: `opengraph-image.tsx`
duplicates the hex values because Satori does not resolve CSS variables.

## Accessibility

- Semantic landmarks, one `h1`, skip link.
- One global `:focus-visible` treatment in `globals.css`.
- Errors are conveyed by icon + text + `role="alert"`, never colour alone.
- `aria-invalid` and `aria-describedby` wired through the `Field` primitive.
- Mobile nav is a disclosure — in document flow, so no focus trap is needed;
  Escape closes it and restores focus.
- App previews are exposed as a single labelled `role="img"` because their
  chips are illustrations, not controls.
- `prefers-reduced-motion` disables transitions and smooth scrolling.

## Testing strategy

| Layer       | Covers                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Validation, email normalisation, anti-spam, rate limiting, repository mapping, design tokens                              |
| Integration | The Server Action end to end with the database mocked: success, invalid, duplicate, backend failure, rate limit, honeypot |
| E2E         | Page load, mobile nav, form labelling and validation, legal routes, SEO metadata                                          |

E2E tests that need a live database skip with an explicit reason rather than
failing, so the suite stays meaningful without credentials.

## Known limitations

- No confirmation email. Deliberate: sender configuration is not valid yet, and
  sending from an unverified domain harms deliverability.
- No analytics provider is connected. `track()` is a no-op until one is.
- The Supabase schema type mirror in `src/lib/supabase/types.ts` is hand-written
  and must be regenerated once the project exists. It must stay a `type` alias,
  not an `interface` — only type aliases get the implicit index signature that
  supabase-js requires, and an interface silently degrades every query to `never`.

## Event Rooms

```
CreateEventForm (client)
  └─ createEventAction         Server Action — src/lib/events/actions.ts
       ├─ createEventSchema       name, window, 24-hour sanity bound
       ├─ authorizeStore          membership from the session, never the form
       ├─ createEvent             service-role insert, retries on code collision
       └─ redirect                to the event's printable page
```

### Authorisation

The store id arrives in a hidden field, so it is attacker-controlled.
`authorizeStore` compares it against the membership `getViewer` resolved from
the session cookie; a store submitting another store's id is refused. Status
changes load the event first and take the store from the row, so posting
another store's event id cannot close their room. Both refusals return the same
message a missing store would, so neither can be used to discover which ids are
real.

RLS backs this up: a store can read its own events and nothing else, and there
are no insert, update or delete policies at all. Verified against a real
PostgreSQL instance — store A cannot read, create, edit or delete anything
belonging to store B, and `anon` is refused outright.

The `select` grant to `authenticated` is written into the migration rather than
inherited from Supabase's default privileges. A policy narrows a grant; it never
creates one, so a migration that assumes the default silently produces
"permission denied" on a database configured differently.

### Join codes

Crockford's base32 — digits, minus the letters that collide with them (I, L, O,
U). Keeping the digit and dropping the letter is what makes correction
possible: a player who reads a printed `1` as `I` still lands in the right room.
Generated with `randomInt`, since a guessable code is a way into an event.

`normalizeJoinCode` is pure and shared by the URL route and the typed-code
form, so `/e/k3m-9pz` and a hand-typed `K3M 9PZ` resolve identically.

**Two code spaces, separated by length.** Six characters is one event; seven is
a store's permanent Counter Code. Both arrive through `/e/CODE` and the same
box on `/join`, and a player never has to know which they hold — but the
application must never confuse them. Different lengths make that impossible
rather than unlikely: one shared length plus two unique indexes would leave a
birthday collision _between_ the tables, and its failure would be silent, a
laminated counter code quietly resolving to a stranger's event. `classifyCode`
is the single place that decides, so nothing else measures lengths.

The store gets the longer code because it is the one that never rotates. An
event code is printed for one night; a counter code is on a wall for a year.

## Store rooms

A store prints one sheet and leaves it up. `src/lib/events/rooms.ts` decides
what that one code means on any given evening.

```
resolveCode(code)                  read path — never opens a room
  ├─ classifyCode                     six characters → events, seven → stores
  ├─ findRunningScheduledEvent        an open event, now or within two hours
  ├─ findOpenWalkInRoom               otherwise the store's walk-in room
  ├─ latestActivityAt → isIdle        quiet for six hours? close it
  └─ outcome: room | lobby | quiet

enterRoomByCode(code)              write path — used only by the join action
  └─ everything above, then openWalkInRoom if the outcome would be `lobby`
```

**A running event always wins.** If a store has a tournament open, the counter
code puts everybody in the tournament rather than opening a rival room beside
it. Splitting the room is the one failure this cannot have: the product is
"find the person in this room who has your card", and two half-rooms answer
that wrongly while looking like they worked. The two-hour doors-open lead
exists for the same reason — without it the early arrivals would land in the
walk-in room and everybody after the start time in the event, the same split
caused by the clock instead of by a race.

**Reading never writes a room into existence.** Somebody glancing at the
counter code on the way past would otherwise leave an empty session in the
store's history whose start time is a lie. Closing a stale room on the read
path _is_ a write, and belongs there: it is cleanup that must happen before
anyone can be told what is running, and the `status = 'open'` guard makes it
idempotent.

**One open walk-in room per store, enforced by a partial unique index** rather
than by the application. Two players scanning at the same moment both find no
room and both try to open one; the loser takes a `23505` and adopts the
winner's room, so from the players' side both taps land in the same place.

**Six hours of quiet ends a room.** Long enough that somebody who posts a Flare
at eleven and somebody who arrives at four see each other's cards — that
continuity across a slow day is the point for a store. Short enough that an
overnight gap always starts a fresh room, so nobody walks in to a board of
yesterday's requests. The finish is stamped at the last activity, not at the
moment the staleness was noticed: a room found stale on Sunday stopped being
used on Friday, and stamping Sunday would tell the store it ran for two days.

A walk-in room has a null `ends_at` while it runs and a null `join_code`
forever, both enforced by check constraints. No code of its own, because a
per-session code would be a second way in that is printed nowhere and changes
every time the room reopens — and because a null keeps `findEventByJoinCode`
from ever resolving one, so a walk-in room can only be reached through the
resolver that knows whether it is still live.

### Public lookup

`/e/[code]` is reached by scanning printed paper, so it is the one page with no
session behind it. It resolves the code with the service role and selects an
explicit column list rather than `*`, so a later migration cannot quietly widen
what a stranger holding a code can see.

Every read degrades rather than throwing: `getSupabaseAdmin` raises when the
service-role key is absent, which once turned an outage into a 500 on a page a
player reached from a counter. A well-formed code that cannot be checked now
says so, and never reports itself as invalid — telling someone their store's
printed code is wrong is worse than admitting the outage.

## Cards

```
CardSearch (client)
  └─ searchCardsAction         Server Action — src/lib/cards/actions.ts
       ├─ cardQuerySchema         collapse, bound to 2–60 characters
       ├─ checkRateLimit          60 per IP per 5 minutes
       └─ searchCards             search_cards() RPC, then printings in one query
```

### Provider abstraction

`CardProvider` has a name, a `capabilities` object and `fetchCards()`. Whatever
the eventual source, it normalises into `ProvidedCard` and nothing downstream
learns where the data came from. `JsonCardProvider` is the reference
implementation, and the importer is a script rather than a Server Action —
loading thousands of cards is a deploy-time operation done by someone holding
the service-role key, so there is no endpoint to protect.

Validation is all-or-nothing and reports every bad record at once. Wrong card
data is worse than missing card data when someone is hunting a trade, so a
failed record is never partially salvaged.

### Artwork

`capabilities.images` is the only gate, checked once in the importer. A
provider that has not declared it cannot populate `image_url` by accident, and
the column has an `https`-only check on top. Nothing is licensed today, so it
is null everywhere and an E2E test asserts the search page renders no remote
images at all. Reasoning in [docs/CARD_DATA.md](./docs/CARD_DATA.md).

### Identity versus printing

`cards` is what a player means by "OP01-024"; `card_printings` is a physical
object. Matching keys off the card, because someone hunting one is nearly
always happy with any printing. Reversing that would mean the player holding
the alternate art never matches the player who needs the card.

### Search

`search_cards()` is a SQL function because the ranking is the feature: trigram
`similarity()` cannot be expressed through PostgREST, and without it a
misspelling returns nothing. `SECURITY INVOKER` and called with the service
role — a definer function would re-open what the table revokes closed.

It scans every card to score it, which is well under a millisecond at a few
thousand cards. If the pool ever outgrows that, the fix is a trigram prefilter,
not a rewrite.

## Joining an Event Room

```
JoinEventForm (client)
  └─ joinEventAction           Server Action — src/lib/events/join-event-actions.ts
       ├─ isValidJoinCode         shape-checked before any query
       ├─ checkRateLimit          20 per IP per 10 minutes
       ├─ findEventByJoinCode     and re-check status === "open"
       ├─ createPlayerSession     only when the browser has no identity yet
       ├─ joinEvent               upsert on (event_id, player_session_id)
       └─ setPlayerCookie         only for a newly created identity
```

Scanning to being in the room is one submission. Splitting identity from
joining would put a second screen between the QR code and the room, which is
the one place the core loop cannot afford friction.

The event comes from the code in the request; the **player always comes from
the cookie**. A session id in the form would let anyone drop someone else into
a room, and a test asserts a submitted one is ignored.

Status is re-checked at the moment of joining rather than trusted from when the
page rendered — a store can close the room in between.

The identity is written before the room membership, so a failed join rolls the
new session back. An orphaned session plus a cookie pointing at it is worse
than nothing: the player would look signed in and be in no room.

### Presence

`last_seen_at`, refreshed when a player loads the room and at most once a
minute, with "here now" being a 15-minute window on it. Deliberately not
websockets — a store wants to know who is around, not who moved their thumb,
and a polled timestamp survives a phone locking in someone's pocket. Realtime
belongs with match notifications, where the latency is the feature.

### Avatars

Initials over one of six hues, both derived from the session id. Generated,
never uploaded: an upload means storage, moderation, and a way to put an
arbitrary image in front of strangers in a room — all to distinguish six people
at a counter, which initials and a colour already do. It also keeps the "no
images we do not own" position intact.

The hues are tokens in `globals.css`, and `design-tokens.test.ts` asserts each
one clears WCAG AA on every surface and that there are exactly as many as the
code assigns from. Nobody reviews the pairing before a player sees it, so an
unreadable combination would otherwise ship silently.

Display names are read from `player_sessions` at query time rather than copied
onto the participant row, so fixing a typo renames the player in every room
they are in.
