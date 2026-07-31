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

| Component          | Why it must be client-side                     |
| ------------------ | ---------------------------------------------- |
| `MobileNav`        | Disclosure state, Escape handling              |
| `WaitlistForm`     | `useActionState`, inline errors, success state |
| `AnalyticsTracker` | Page view and delegated click tracking         |

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

| Control               | Implementation                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| No client DB access   | Writes go only through the Server Action using the service-role key                                |
| Service key isolation | `src/lib/supabase/admin.ts` imports `server-only` — leaking it fails the build                     |
| Row Level Security    | Enabled on `waitlist_signups` with **no policies**; privileges revoked from `anon`/`authenticated` |
| Input validation      | Zod on the server; the database repeats the checks as constraints                                  |
| Mass assignment       | Fields are read by name; `status`, `id` and `created_at` are never client-settable                 |
| Rate limiting         | 5 submissions per IP per 10 minutes                                                                |
| Bot filtering         | Hidden honeypot field plus a minimum fill time                                                     |
| Error disclosure      | Database errors are logged server-side; users get a fixed generic message                          |

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

Identity comes from Supabase Auth, by emailed magic link. There are no
passwords to store, reset, or leak.

`getViewer()` resolves the caller to one of four shapes — `anonymous`,
`admin`, `store`, `unaffiliated` — and every guard derives from it. It calls
`getUser()` rather than `getSession()`: the latter reads the cookie without
verifying it, so it can be forged, and this result gates the admin console.

| Area     | Who reaches it                                                 |
| -------- | -------------------------------------------------------------- |
| `/admin` | Accounts listed in `admin_users`                               |
| `/store` | Accounts with a row in `store_members`                         |
| `/login` | Anyone, but a link is only sent to accounts that already exist |

**Admins are an explicit allow-list with no self-service path.** Rows go into
`admin_users` by hand, in SQL.

**Guards live in the action, not only the page.** A Server Action is a public
POST endpoint, so hiding a form hides nothing; `inviteStoreAction` re-checks
the viewer itself. The admin layout and the admin page each guard separately
too — a layout is not a security boundary, and a page added later should not
inherit the appearance of protection without the substance.

**Sign-in reveals nothing.** `shouldCreateUser` is off and the response is
identical whether or not the address belongs to a store, so the form cannot be
used to enumerate who is in the beta.

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
