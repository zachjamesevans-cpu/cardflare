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
  auth/                Session, viewer roles, guards, sign-in actions, and
                       invite-link.ts — the one-click setup link
  email/               Provider client and message templates
  cards/               Card provider interface, importer, search
  events/              Event Rooms: schema, repository, actions, join codes, QR,
                       and rooms.ts — what a scanned code resolves to
  matching/            Match rules, offers: schema, repository, actions
  trades/              Trade confirmation, history, binder nudge, event stats
  players/             Guest sessions: schema, repository, cookie, actions
  shows/               Card shows: vendors, booths, inventory, availability
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
| `RoomTicker`         | Interval + `router.refresh()` while visible    |
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
| `/profile` | Anyone signed in                                                  |
| `/login`   | Anyone, but nothing is ever sent to an address without an account |

### Sessions, and why there is a proxy

`src/proxy.ts` exists for one reason: Supabase access tokens last an hour
and renew with a _rotating_ refresh token, and the renewal only counts if the
new pair reaches the browser.

There was no proxy, so renewal happened during page renders — and a
Server Component cannot set cookies, so the `setAll` in
`src/lib/supabase/server.ts` caught the new pair and dropped it. Every render
spent the refresh token and discarded the replacement, invalidating the one the
browser still held. An hour after signing in, an operator was signed out. It
looked like a design choice ("sign-in is by emailed link") rather than the bug
it was.

It also made a signed-in admin read as a stranger: `getViewer` queries
`admin_users` through the user's own client, and a request carrying a spent
token reads nothing, so `requireAdmin` bounced them to the marketing site.

The proxy runs before the render and owns a real response, so the refreshed
cookies survive. It writes them to the request too — the render behind it reads
that copy, and without it the very render the refresh exists to serve would
still query as an expired user.

The matcher covers only `/store`, `/admin`, `/account`, `/profile`, `/login`
and `/welcome`. `/account` is kept alongside `/profile` because both old paths
still resolve: `/account` permanently redirects to the profile, and
`/account/password` to `/profile/password`, which matters because password
reset emails already in somebody's inbox point at the old path and an email
cannot be edited after it is sent. `getUser`
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

#### One email, not two

Still tokenless in the sense above, and the change is worth reading carefully
because it looks like a contradiction.

The invitation used to point at `/login/reset`, which asked for the address the
invitation had just been sent to, which triggered a **second** email carrying
the link that actually did something. Two emails to do one thing, and the first
did nothing but ask for a click.

`src/lib/auth/invite-link.ts` calls `admin.auth.admin.generateLink()`, which
mints the credential **without sending anything**. The email carries a
CardFlare URL built from the returned `hashed_token`:
`/auth/confirm?token_hash=…&type=recovery&next=/welcome`, and that route
redeems it with `verifyOtp()`. So there is still no secret of ours: it is
Supabase's token, hashed by Supabase, verified by Supabase.

Two details that are silent when wrong:

- **`type: "recovery"`, not `"invite"`.** `ensureAuthUser` has already created
  the auth account by this point, and `generateLink({ type: "invite" })`
  creates the user itself and fails on one that exists. Recovery works on an
  account that has never had a password, which is exactly this case.
- **`hashed_token`, never the `action_link` sitting next to it.** The action
  link points at Supabase's `/auth/v1/verify`, which hands the session back in
  ways that assume the browser that _requested_ the link is the one opening it
  — a URL fragment a server route never sees, or a PKCE code whose verifier
  lives in the requester's cookies. Here the requester was the admin's server
  and the opener is a shop owner's phone that has never touched CardFlare, so
  an emailed action link dies on every device that matters. `verifyOtp` with
  the hashed token asks Supabase directly and needs no prior contact.

That split is also why `/auth/confirm` exists alongside `/auth/callback`
rather than replacing it: the callback exchanges PKCE codes for the flows a
visitor starts in their own browser — magic links, password resets, OAuth —
where the verifier cookie is exactly where it should be. Each route redeems
the one kind of credential it understands, and `/auth/confirm` accepts only
`type=recovery`, so neither can be bent into a general-purpose verifier.

The link lands on `/welcome`: signed in already, address shown rather than
retyped, password and confirmation the only fields.

Minting can fail. When it does the invitation still sends, without the
shortcut, and its copy changes to describe the two-step route honestly rather
than promising a button that is not there.

#### Expiry is the common case, not the edge

These links expire after Supabase's **Email OTP Expiration** — one hour by
default — and a shop owner reads email the next morning. A dead button is
therefore the likeliest single outcome of the most important message CardFlare
sends, so every path that can fail lands on `/login/reset?expired=1`, which
says the link expired and is one field from a fresh one.

Not `/login`: an invited store has no password yet, so a sign-in form asks them
for something they do not have.

Raising Email OTP Expiration is a deployment setting, and worth doing — see
`docs/DEPLOYMENT.md`.

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

### Event times

An event happens at a place, and the place has a timezone. `stores.timezone`
holds it; times themselves stay `timestamptz`, because an instant was always
the right thing to store.

The bug this fixed was not the label. `datetime-local` submits
"2026-09-12T18:00" with no zone, and `Date.parse` reads a bare string like that
in the _server's_ zone — UTC on Vercel. A store owner in Austin typing 6pm
stored one in the afternoon, and the dashboard displayed that wrong instant
accurately as "6:00 PM UTC".

`src/lib/time/zone.ts` does the conversion on `Intl`, which already carries the
IANA database — a date library would be several hundred kilobytes to avoid
forty testable lines. `localToInstant` runs **two passes**: the first guess
uses the offset in force at the typed time read as UTC, which is on the wrong
side of a daylight-saving change whenever the real answer is on the other, and
re-reading the offset at the candidate instant corrects it. One pass is an hour
wrong for the few hours after a changeover — a store opening early on the
Sunday the clocks go forward would have printed the wrong time on its counter
sheet.

Ordering and duration are checked on the converted instants rather than the
typed strings, because across a change those disagree: twenty-five wall-clock
hours in autumn is twenty-six real ones.

**The zone comes from the store row, never from the form** — the same rule as
the store id, which is authorised against the session rather than trusted. A
submitted zone would otherwise decide what somebody's "6pm" meant.

Defaulting to UTC means nothing moves under an existing store until it says
where it is, and changing it never moves an event already created.

### Open to trades

`event_participants.open_to_trades`. Most of a room is not hunting a specific
card, and a newer player often cannot name what they want — before this they
had nothing to post, so they never appeared on the Flare board, which is the
one surface everyone reads.

Not a Flare with a null `card_id`. A Flare is a request for a card, and
relaxing that constraint to hold "nothing in particular" would put a non-card
into a list built to show cards and cost the board its meaning. Being open to
trades is a property of a person in a room, and `event_participants` is exactly
the row that says so — which also makes it one per player per room for free,
via the unique index that is already there.

Per room rather than on the session, so it expires by itself: leaving drops the
row. That avoids the stale-signal problem the portable binder needed a
confirmation step to solve.

**Public to the room, unlike the Have List.** The two look similar and are
opposites: a Have List broadcasts what a named person is carrying, which is why
it is private; this is an invitation to come over.

The board lists open players after everyone with a specific request, because a
named card is easier to act on than "surprise me". A player who has posted
Flares _and_ is open gets one extra row inside their own group rather than a
second card.

The toggle sits directly under the Post-a-Flare form, styled as the other
answer to the same question. It began as its own card higher up the page, next
to nothing in particular, and founder feedback was that people wanting to say
"open to anything" never connected it with posting — the moment somebody
thinks "I don't know what to search for" is the moment it has to be in front
of them.

### Matching and offers

Matching is a per-viewer, read-time computation, not a background job: the
room page derives "which of these Flares can _you_ answer" from the binder it
already loaded (`src/lib/matching/schema.ts`). There is no matches table to
drift out of date, and nothing is computed for players who are not looking.

**Printings are honoured, not guessed.** A Flare naming a printing matches
exactly only on that printing; the base art — or a binder entry that named no
printing — shows as "you have another printing". `HeldByCard` stores, per held
card, only the printings the binder _names_: key presence answers "do you have
the card", the set answers "can you prove which printing".

**An offer is the holder choosing to be found.** `flare_responses` carries the
responder, the Flare, and an optional 80-character "where to find me" — and
nothing from the binder: not the printing, not the quantity. The privacy line
from Milestone 6 (the room learns you can help only when you say so) survives
matching intact. Offers from players who left the room are hidden at read
time, since "come find me" is false once they have; rejoining restores them.

The server re-checks every rule the UI already respects, because a Server
Action is a public POST endpoint: the Flare must be open and in the caller's
room, never their own, and **the responder's binder must actually hold the
card** — the check that stops offers being a way to put your name on every
Flare in a room. Capped at 30 open offers per room.

**Freshness is a poll, not a socket.** `RoomTicker` re-renders the room from
the server once a minute while the tab is visible, and immediately on return
— which also keeps `last_seen_at` honest, since the render is the heartbeat.
Same decision presence made in Milestone 4, for the same reasons: the response
to a match is a walk across a physical room, and a websocket would trade
connection management on locked phones for a few seconds nobody needs.
Supabase Realtime is ruled out regardless — RLS with zero policies means the
anon key can subscribe to nothing, which is the point of the security model.

### Trades

A trade row is the tally that the loop closed: event, Flare, both sessions,
card, quantity, `confirmed_at`. Written once, by the Flare's author, when
cards change hands. No prices anywhere — CardFlare is not a pricing
application, per PRODUCT.md.

**Who may write whom into history.** Only the author can confirm their own
Flare, and a named partner must have a standing offer on it — the offer row
is the proof they said "I have this". Without that rule, confirming would
let one player write another's name into a trade they never acknowledged.
A trade with somebody who never tapped "offer" is recorded partnerless.

**Retry-safe ordering.** The trade insert runs before the Flare's close, and
a partial unique index (`one trade per Flare`) turns a retried confirm into
"already recorded" — supabase-js cannot name a partial index in `onConflict`,
so idempotency is the `23505` error code instead. A half-completed confirm
can only under-close, never double-count.

**History survives its pointers.** Session, Flare and printing references go
null on deletion rather than cascading: sessions expire in 30 days by design,
and a store's event numbers must not quietly shrink as they do. Only the
event takes its trades with it.

**The binder nudge.** After a holder-side trade, the room asks about exactly
that card. The rule is one comparison — prompt when the trade is newer than
the entry's own `confirmed_at`, with NaN failing towards stale — so "still
have it" is just a per-entry re-confirmation and there is no prompt state to
store. The nudge asks; it never edits the binder itself.

**Event analytics are counts.** Players, Flares, offers, trades — the funnel
a store reads after a night. Totals only, never who traded what with whom:
the store hosts the room, it does not read it.

**A confirmed trade is the only thing that earns Embers.** See below.

## Profiles and Embers

Only a confirmed trade earns anything. Not posting, not pledging, not turning
up. The one act the whole product exists to cause is the only one that pays.

### One account, one name

`players.display_name` is unique, case-insensitively, enforced by a unique
index on `lower(display_name)`. Guests are deliberately exempt: a guest's name
lives on `player_sessions`, expires with it, and only has to tell six people at
a counter apart for one evening.

Availability is decided by the index, never by a SELECT before the UPDATE — two
people can type the same name into two phones at the same counter, and
check-then-write loses that race every time. `setDisplayName` returns `taken`
on a `23505` and the UI says so.

The name is written through to every `player_sessions` row the account owns.
Rooms render the session's name, and a copy that is never refreshed drifts:
rename yourself mid-event and the board would keep showing whatever you were
called when you walked in. Write-through rather than a join in every name
lookup, because there are five of those and one of these.

A signed-in player joins a room **as their account**, and the submitted name is
ignored rather than merely pre-filled. That was the founder's report — signing
in still dropped them in as a guest — and pre-filling was exactly the bug: the
form was the source of truth and the account was not consulted.

An invitation carries a name typed months earlier, so `claimPendingPlayerInvite`
nudges it ("Zach", "Zach2", …) until the index accepts it. Being unable to sign
in because a stranger shares your first name is not an acceptable outcome.

### Setting up an account

Signing in is not the same as being somebody. `players.onboarded_at` is null
until a player has chosen a username, and `/profile` bounces them to
`/welcome/username` until they have — so a wizard nobody can fall out of is
one nobody has to remember to come back to. Existing accounts were backfilled
from `created_at` by the migration, so shipping the flow did not ambush the
pilot with a setup screen for accounts they had been using for weeks.

Two steps: the name, then an optional picture. The account is marked set up at
the **name**, not after the picture, because the picture is genuinely optional
— the generated initials are a real avatar — and gating "you are set up" on
something optional leaves anyone who skipped it permanently owing a step.

The flow keys on `onboarded_at`, never on how the account was created. That is
the seam that makes invite-only and open registration the same path: opening
registration is a decision about who may create an account, not a second
onboarding to build. Public registration itself is still closed — PRODUCT.md
says invite-only pilot, and that has not changed.

The username field checks availability while it is typed. A courtesy only: the
unique index decides, two people can type the same name at the same moment, and
only the database sees both.

### Admin grants

The console can hand a player Embers and a permanent unlock. Both live in
`src/lib/admin/grants.ts`, both re-establish admin inside the Server Action —
a Server Action is a public POST endpoint, so hiding a form on a guarded page
hides nothing, and these write to somebody else's account.

`players.cosmetics_unlocked` is a flag rather than a pile of ownership rows,
and the founder's words are why: "always unlocked, forever". Granting rows
would only cover the catalogue as it stands today, so a cosmetic shipped next
month would appear locked to somebody who was told they had everything. The
flag also clears the lifetime-earned gates, because making someone who was
handed everything still grind to 500 for Orbit is a strange kind of gift.
Turning it off leaves anything actually bought still owned — the flag and the
purchase rows are separate answers to "do they own this".

An Ember grant goes through `award_embers` like every other movement, so it is
in the ledger with `reason = 'grant'`. It raises the lifetime badge as well as
the balance, which is a real cost: an admin gift shows up as trading the player
did not do. The UI says so above the field rather than leaving it to be
discovered. There is deliberately no way to take Embers away — `embers_earned`
is monotonic by design, and an admin "undo" would be the one thing that breaks
what the badge means. `GRANT_MAX` caps a single grant at 10,000 as a guard
against a slipped digit, not as a policy about generosity.

Search is backed by a trigram index on `display_name`, because the query is a
leading-wildcard `ilike` that no b-tree can serve.

### Two numbers, and why

`players.embers_earned` is a lifetime total that only ever goes up: it is the
badge, it is public, and it says how much trading somebody has actually done.
`players.embers_balance` is what is left to spend, it is private, and buying
something takes from it alone.

A number that can go down is a bad status signal; a status number you cannot
spend is a bad shop. Two numbers is how both stay honest — the founder's call,
and the split is structural rather than conventional: `publicProfile` returns
a type with no balance field in it, so a page that renders somebody else's
profile could not leak it if it tried.

Embers are deliberately not purchasable, giftable or transferable. The moment
they can be bought the badge stops meaning "this person trades".

### Movements go through two SQL functions, never an UPDATE

`award_embers` and `spend_embers` are `security definer` and do the ledger row
and the balance in one statement. Both were probed on real PostgreSQL 16, and
both fixes below came out of that probe rather than out of review:

- **Spending is idempotent inside the UPDATE's WHERE clause**, not in a check
  before it. The first cut checked the ledger, then updated; two taps on Buy
  raced, the second blocked on the row lock, and when it woke the UPDATE had
  already succeeded while the ledger insert silently conflicted. The balance
  came off twice for one purchase. `and not exists (select 1 from
ember_ledger where ref = spend_ref)` inside the same statement is
  re-evaluated after the lock releases, so the second attempt matches nothing.
- **`ref` is the idempotency key.** Confirming a trade is retry-safe by
  design, so the award is keyed `trade:<trade_id>:<player_id>` — per player,
  because a confirmed trade pays both sides and each needs its own row.

### Free cosmetics have no ownership row

`cost_embers = 0` means everybody owns it, forever, including whoever signs up
tonight. The first cut seeded a row per free item per player, and the probe
caught what that misses: a migration runs once, so a player created afterwards
started with an empty wardrobe and nothing to equip. A null `equipped_*`
column reads as the free default for the same reason — nothing to backfill,
nothing to drift.

### Anti-farming, and that it is a proposal

A trade with somebody new pays 10; a repeat partner pays 2; a trade with
nobody named pays 3. The taper is NOT something the founder asked for — it is
in `ember-rules.ts` because without it two friends can sit at a table tapping
confirm at each other until the badge means nothing, and the badge is the
entire point of `embers_earned`. Two rather than zero because regulars trading
with regulars is a real night at a store. Setting `EMBERS_REPEAT_PARTNER` to
`EMBERS_NEW_PARTNER` turns it off.

"Have we traded before" is asked through sessions rather than accounts,
because `trades` records who was in the room and a room identity is per-device
and per-event. A failed lookup falls back to the _smaller_ award: paying the
new-partner rate on an error would make "break the history query" the way to
farm the badge.

### The payout cannot break a trade

`awardTradeEmbers` runs last inside `confirmTrade`, logs its failures and
throws nothing. The trade is the product; the Embers are the garnish, and a
reward system having a bad day must never be why somebody at a counter cannot
finish. Guests earn nothing, because there is no account to hold it — a guest
session expires in thirty days and would take the badge with it.

### The wardrobe

Twelve items in three slots: frames, holo patterns and animated effects, all
scoped to `.cf-showcase`, which only a profile showcase renders. The foil work
removed from the Flare board lives here now, and that containment is the
point: a shimmer on the board says "rare" when the board needs to say
"available"; on a profile there is nothing to confuse it with.

Class names are written out one per slug in both `globals.css` and
`cosmetic-card.tsx`. Tailwind cannot see a class assembled at runtime, and
neither can a person grepping for where a style is used; an unknown slug falls
through to a plain card, which is the right failure.

The app's version is an approximation and says so in its own doc comment:
React Native has no blend modes, so `mobile/src/cosmetic-card.tsx` layers
translucent gradients instead. Frames and motion timings are exact; the foil
is quieter.

**Frames are worn in rooms, not only on profiles.** A thing you earned that
nobody sees you wearing is not really a reward, so the equipped frame rings the
avatar in the roster, the lobby and the Flare board — on the initials as well
as on a picture, because somebody who spent 600 Embers should be wearing it
whether or not they uploaded a photograph. Avatar frames are their own class
set (`.cf-avatar-frame-*`) rather than shared with the card frames: one is an
inset ring on a rectangle, the other a ring outside a circle whose diameter
changes with the size prop, and sharing one rule would fit neither.

## Card shows

The second kind of operator, and the third length in the code namespace. A
**vendor** (`stores.kind = 'vendor'`) arrives through the same invitation
pipeline and the same sign-in as a game store — one switch decides which
dashboard the account gets. A **show** belongs to no store: it has a name, a
weekend-long window in its own timezone, and an **eight-character** code, so
the same `/e/CODE` route serves events (6), counter codes (7) and shows (8)
without a lookup ever deciding which is which.

The attendee path is deliberately sessionless: scan, type a card name, read
booth numbers. No account, no join step, nothing written. `resolveCode`
returns a show as a place to _look things up_, never a room to enter — no
participation row exists for a show, and `enterRoomByCode` refuses the length
outright.

**Inventory models the vendor's two physical realities.** A row is raw or a
slab, and a slab names its grader (PSA, BGS, CGC — a shape-checked text
column, because grading companies appear faster than migrations should have
to) and carries a 1–10 half-step grade, or none for a case marked
"Authentic". The same card as a raw playset, a PSA 10 and a BGS 9.5 is three
rows, because those are three different reasons to cross a hall. Restating a
row replaces its quantity — that is what "upload your inventory before the
show" means row by row. **No prices anywhere**, per PRODUCT.md.

**Availability is roster-gated.** An attendee search runs the ordinary card
search, then joins matching inventory against the show's `show_vendors`
roster — inventory from a vendor who never claimed a booth at this show is
invisible at this show, which keeps uploading stock from advertising a
vendor at every show in the system. Results sort by booth as a walking
route, slabs first, best grade first.

Bulk inventory import (CSV from a vendor's existing tooling) is deliberately
unbuilt until a real vendor's file has been seen: a guessed column mapping
that silently mislists someone's stock is worse than an evening of tapping.

### Avatars

Initials over one of six hues, both derived from the session id. This is what
a guest gets, what a player who has not chosen a picture gets, and what
renders when a picture fails to load.

Uploaded pictures came later, and the argument that used to rule them out —
storage, moderation, and an arbitrary image in front of strangers — was
answered by re-encoding rather than by refusing. `setAvatar` decodes to raw
pixels with sharp, centre-crops to a 512px square and writes a fresh **JPEG**,
so the bytes served are ones this server produced: whatever was in the
original file's metadata, trailing data or mislabelled container does not
survive the round trip. Writes go through the service role only.

JPEG rather than WebP is a diagnosis, not a taste. Every avatar this feature
ever served was WebP and every one failed to render on the founder's phone,
while every other image on the site loaded — card art included, because
`/_next/image` negotiates the format per browser and falls back when WebP is
not wanted, where our route served WebP unconditionally. Some iOS
configurations (Lockdown Mode most famously) refuse to decode WebP entirely,
and no server-side check catches that because servers do not decode. The
admin console's picture system check now includes browser-local decode tests
for both formats, so this class of failure names itself. Old WebP objects are
still served with their true content type; re-uploading replaces them.

The object path carries a timestamp. A fixed path would be cached by every CDN
and browser between the bucket and a phone at a counter, and the player would
swear the upload failed.

**Avatars are served from CardFlare's own domain, never the storage host.**
`players.avatar_url` holds the object path, and `/api/avatars/<path>` streams
it with a service-role read and a one-year immutable cache. This is a
correction, not a preference: the first cut pointed an `<img>` straight at the
Supabase public URL, the server could fetch it and the founder's phone could
not. That is the same failure that already forced the app's writes into a
header — something between a real phone and a third-party host eats the
request. Serving from the origin the browser already has open removes the
whole class, and it takes "is the bucket public" out of the equation: the
picture renders either way. Rows written before the change hold a full URL and
are passed through untouched.

The hues are tokens in `globals.css`, and `design-tokens.test.ts` asserts each
one clears WCAG AA on every surface and that there are exactly as many as the
code assigns from. Nobody reviews the pairing before a player sees it, so an
unreadable combination would otherwise ship silently.

Display names are read from `player_sessions` at query time rather than copied
onto the participant row, so fixing a typo renames the player in every room
they are in.
