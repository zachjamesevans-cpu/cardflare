# CardFlare — Deployment

Everything here needs access to Supabase, Vercel and GoDaddy, so it is done by
the project owner. Work top to bottom; the checklist at the end mirrors these
steps.

> **DNS values are never written down in this repository.** Vercel shows the
> exact records for your project. Copy them from the Vercel dashboard at the
> time you add the domain — do not copy them from a tutorial, and do not trust
> any values quoted from memory.

---

## 0. Get the code onto the default branch

Vercel builds a project's **production** deployment from one branch, which
defaults to the repository's default branch (`main`). Connecting Vercel before
the milestone is merged produces a successful build of an empty site.

Merge the milestone branch into `main` first — via a pull request on GitHub, or
locally:

```bash
git checkout main
git merge --ff-only claude/cardflare-project-init-tv2cxz
git push origin main
```

Confirm `main` contains `src/` and `supabase/` on GitHub before continuing.

## 1. Create the Supabase project

1. Sign in at <https://supabase.com> and create a new project.
2. Pick a region near your first pilot stores.
3. Save the generated database password somewhere safe.
4. Go to **Project Settings → API** and note:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

> The `service_role` key bypasses Row Level Security. It goes only into Vercel's
> server-side environment variables. Never prefix it with `NEXT_PUBLIC_`, never
> paste it into client code, and never commit it.

## 2. Run the database migration

The migration creates the `waitlist_signups` table, its enums, its constraints,
the unique email index, and enables RLS with no policies.

**Option A — Supabase SQL Editor (simplest)**

1. Open **SQL Editor** in the Supabase dashboard.
2. Paste the contents of
   `supabase/migrations/20260730120000_create_waitlist_signups.sql`.
3. Run it.

**Option B — Supabase CLI**

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

**Verify it worked.** In the SQL Editor:

```sql
-- Expect: rowsecurity = true
select rowsecurity from pg_tables where tablename = 'waitlist_signups';

-- Expect: 0 rows. Any policy here would expose the waitlist.
select * from pg_policies where tablename = 'waitlist_signups';
```

### Later migrations

Each milestone adds one. Run them in filename order, the same way — paste into
the SQL Editor, or `npx supabase db push`.

| File                                           | Adds                                             |
| ---------------------------------------------- | ------------------------------------------------ |
| `20260731090000_create_beta_foundations.sql`   | Admins, stores, store members, store invitations |
| `20260801120000_create_player_sessions.sql`    | Guest player sessions                            |
| `20260801150000_create_events.sql`             | Event Rooms, join codes, event lifecycle         |
| `20260801180000_create_cards.sql`              | Cards, printings, aliases, ranked search         |
| `20260801210000_create_event_participants.sql` | Players in an Event Room, presence               |

A migration that has not been run shows up as `relation "public.<table>" does
not exist` the first time the app touches it.

**Verify the player sessions table**, since it holds a credential:

```sql
-- Expect: rowsecurity = true, and zero policies.
select rowsecurity from pg_tables where tablename = 'player_sessions';
select count(*) from pg_policies where tablename = 'player_sessions';
```

## 3. Authentication URLs

Required from Milestone 2 onward, since stores sign in with a magic link.

In Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://cardflare.gg`. Leaving this at the default
  `http://localhost:3000` is the usual cause of a sign-in link that lands on a
  dead localhost page.
- **Redirect URLs**:

  ```
  https://cardflare.gg/auth/callback
  https://cardflare.gg/auth/callback**
  http://localhost:3000/auth/callback**
  ```

**The `**` entries are required, not belt-and-braces.** The app appends
`?next=…` to the callback, and an exact-match entry does not cover a URL that
carries a query string.

A redirect that is not matched by this list is silently **discarded** — Supabase
falls back to Site URL rather than reporting an error. The symptom is a link
that goes to the wrong host and the wrong path, which reads like a broken
email rather than a missing setting.

> **Auth emails come from Supabase, not Resend.** By default they are sent from
> Supabase's shared sender with their branding, and the free tier rate-limits
> them sharply. To send from `cardflare.gg` instead, set Resend's SMTP details
> under **Project Settings → Authentication → SMTP Settings**. Configuration
> only — no code change.

### Password sign-in

Operators sign in with an email address and a password. Two settings in
Supabase → **Authentication → Sign In / Providers → Email** need checking,
because the defaults are weaker than what the app asks for:

- **Minimum password length: set it to 10.** Supabase's default is 6. CardFlare
  refuses anything shorter in `src/lib/auth/schema.ts`, but that only governs
  CardFlare's own forms — the Supabase setting is the one that holds if a
  password is ever set any other way.
- **Leaked password protection: on.** Checks new passwords against Have I Been
  Pwned by hash prefix, so the password itself never leaves Supabase. The app
  surfaces the rejection when it comes back.

Nothing else is required: an invited store's account already exists with no
password, and Supabase will send it a recovery link happily, so
`/login/reset` is both "forgot my password" and "set my first one".

> **Sessions depend on `src/middleware.ts`.** Access tokens last an hour and
> renew with a rotating refresh token, and the renewed pair only reaches the
> browser because middleware writes it there. If sign-ins start expiring after
> about an hour, that file — or its `matcher` — is the first place to look.

### Social sign-in (optional)

Not configured, and nothing renders until it is. Two steps, in order:

1. **Supabase → Authentication → Providers**, enable the provider and paste in
   its client id and secret. For Google that means an OAuth client in Google
   Cloud Console with `https://<project-ref>.supabase.co/auth/v1/callback` as
   an authorised redirect URI. Apple additionally needs an Apple Developer
   Program membership, a Services ID and a signing key.
2. **Set `AUTH_PROVIDERS`** in Vercel to a comma-separated list of what you
   configured — `google`, or `google,apple`.

Both steps are needed. Step 1 without step 2 means no button appears; step 2
without step 1 means a button that leads to a Supabase error page. Nothing in
the app can verify step 1, which is exactly why it will not guess.

### Make yourself an admin

Admins are an explicit allow-list; there is no self-service path into it, by
design. Sign in once at `/login` so an account exists, then run this in the
**SQL Editor**:

```sql
insert into public.admin_users (user_id, note)
select id, 'founder'
  from auth.users
 where email = 'you@example.com'
on conflict (user_id) do nothing;
```

Confirm it took effect:

```sql
select u.email from public.admin_users a join auth.users u on u.id = a.user_id;
```

`/admin` is now reachable for that account. Anyone else signing in lands on
`/store`, and sees only their own store.

## 4. Connect the repository to Vercel

1. Sign in at <https://vercel.com> and choose **Add New → Project**.
2. Import the `cardflare` GitHub repository.
3. Vercel detects Next.js. Leave the build settings at their defaults —
   framework preset Next.js, build command `next build`, install `npm install`.
4. Do **not** deploy yet. Add environment variables first (next step), or
   deploy and then redeploy after adding them.

## 5. Add environment variables

In **Project Settings → Environment Variables**, add these for
**Production**, **Preview** and **Development**:

| Name                            | Value                     | Notes                    |
| ------------------------------- | ------------------------- | ------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL      |                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key         | Public by design         |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase service_role key | **Secret. Server only.** |
| `NEXT_PUBLIC_SITE_URL`          | `https://cardflare.gg`    | **Production only**      |
| `AUTH_PROVIDERS`                | `google` / `google,apple` | Optional. See step 3     |

Leave `NEXT_PUBLIC_SITE_URL` unset on Preview so preview deployments use their
own URL for canonical tags and sitemap entries instead of advertising the
production domain.

Then **Deploy**.

> The waitlist form renders without Supabase configured, but every submission
> returns a generic error and logs a warning. If submissions fail on the live
> site, check these variables first.

## 6. Add the custom domain

1. In Vercel: **Project Settings → Domains**.
2. Add `cardflare.gg`.
3. Add `www.cardflare.gg`.
4. Vercel now displays the **exact DNS records** you need. Keep this screen
   open — you are about to copy from it verbatim.

## 7. Update DNS at GoDaddy

1. Sign in at GoDaddy → **My Products** → `cardflare.gg` → **DNS**.
2. For each record Vercel showed you, add or edit the matching record in
   GoDaddy so it exactly matches Vercel's values.
   - Typically one record for the apex (`@`) and one for `www`.
   - GoDaddy writes the apex host as `@`; Vercel may display it as
     `cardflare.gg`. They mean the same thing.
   - Remove GoDaddy's default parking records that conflict with the new ones.
3. Set TTL to the lowest GoDaddy offers while you are verifying, so mistakes
   are cheap to fix.

**Copy the record types, names, and values from the Vercel dashboard. Do not
invent them.** Vercel's required values differ between projects and change over
time.

DNS usually propagates in minutes but can take up to 48 hours. Vercel's Domains
screen shows verification status.

## 8. Choose the canonical domain

Pick `cardflare.gg` as primary (it is what `NEXT_PUBLIC_SITE_URL` and all
metadata already assume).

In **Settings → Domains**, set `www.cardflare.gg` to **redirect** to
`cardflare.gg`. This keeps one canonical URL for SEO and matches the
`alternates.canonical` values the app emits.

## 9. HTTPS

Vercel provisions and renews TLS certificates automatically once DNS verifies.
No action needed. Confirm the padlock appears on both hostnames.

## 10. Verify production

- [ ] `https://cardflare.gg` loads
- [ ] `https://www.cardflare.gg` redirects to `https://cardflare.gg`
- [ ] Padlock / valid certificate on both
- [ ] Page renders correctly on a real phone, not just a resized browser
- [ ] `https://cardflare.gg/robots.txt` lists the sitemap
- [ ] `https://cardflare.gg/sitemap.xml` lists `/`, `/privacy`, `/terms`
- [ ] `https://cardflare.gg/privacy` and `/terms` load
- [ ] Favicon appears in the browser tab
- [ ] Paste the URL into Slack/Discord/X — the Open Graph card renders
- [ ] **Submit the waitlist form with a real address**
- [ ] The row appears in Supabase → **Table Editor → waitlist_signups**
- [ ] **Submit the same address again** — you see "You're already on the list",
      not an error
- [ ] Submit with an invalid email — you get an inline validation message

### Confirm the waitlist is not publicly readable

This is the single most important security check. Run it against production:

```bash
curl "https://<project-ref>.supabase.co/rest/v1/waitlist_signups" \
  -H "apikey: <anon-key>" \
  -H "Authorization: Bearer <anon-key>"
```

You must **not** get signup rows back. An empty array or a permission error is
correct. If you see data, stop and re-check step 2.

## 11. Outbound email (optional)

Waitlist confirmations and store invites both send once this is configured.
Until then they simply send nothing — the feature is inert, not broken, when
the variables are absent. An invite still creates the store, and the admin
console says plainly that no email went out.

**Do this only after `cardflare.gg` DNS is live.** Sending from an unverified
domain gets messages filtered or refused, and a domain that starts out sending
unauthenticated mail carries that reputation forward.

### Verify the sending domain

1. Create an account at <https://resend.com>.
2. **Domains → Add Domain** → `cardflare.gg`.
3. Resend shows a set of DNS records — typically DKIM, SPF and a DMARC
   suggestion. Add each to GoDaddy exactly as shown, the same way you added
   Vercel's records.
4. Wait for Resend to report the domain as **Verified**.

As with Vercel's records, copy them from Resend's dashboard. They are unique to
your domain and are not written down here.

> Adding these does not affect the Vercel records already in place. Mail records
> and website records coexist; just don't edit or delete the existing ones.

#### If the domain already receives mail (Google Workspace, etc.)

Sending through Resend and receiving through Workspace on the same domain is
normal and supported, but three record types allow only **one** entry per name.
Adding a second silently breaks the first.

- **MX** — these route _incoming_ mail and belong to your mailbox provider.
  Resend's records go on a subdomain (`send.cardflare.gg` or similar), which
  does not collide with the apex. **If Resend ever asks for an MX record on the
  apex, stop** — that would take over delivery and break the mailbox.
- **SPF** (`TXT`, starting `v=spf1`) — only one per name is valid. If Resend's
  SPF lands on its own subdomain there is nothing to reconcile. If it targets a
  name that already has one, **merge the two into a single record** by adding
  Resend's `include:` to the existing one. Never publish two.
- **DMARC** (`TXT` at `_dmarc`) — one only. If your mailbox provider already
  set one up, leave it; do not add a second.

DKIM is the exception and needs no care: each provider publishes under its own
selector (`google._domainkey`, `resend._domainkey`), so they coexist by design.

If Resend's instructions appear to conflict with a record already in the zone,
screenshot both and resolve it before changing anything. A broken MX record
stops mail arriving, and the failure is silent from the sender's side.

### Add the two variables

**API Keys → Create API Key**, then in Vercel → Settings → Environment
Variables:

| Name                   | Value                            | Environments        |
| ---------------------- | -------------------------------- | ------------------- |
| `RESEND_API_KEY`       | The key from Resend              | Production, Preview |
| `CARDFLARE_FROM_EMAIL` | `CardFlare <hello@cardflare.gg>` | Production, Preview |

Both are required. One without the other counts as unconfigured and nothing
sends. The address must be on the domain you just verified.

Then **Deployments → ⋯ → Redeploy**, as with any environment variable change.

### Check it

Sign up with an address you can read. You should receive the confirmation
within a minute or so.

- [ ] Email arrives, and lands in the inbox rather than spam
- [ ] The name shown is the one submitted
- [ ] Signing up **again** with the same address sends **no** second email
- [ ] Resend's dashboard shows the send under **Emails**

That third check matters: the email fires only when a row is actually created.
That is what stops the form being used to flood someone else's inbox by
resubmitting their address.

If nothing arrives, check Resend's **Emails** log first — it distinguishes
"never sent" from "sent and bounced". A `403` or `422` in Vercel's runtime logs
usually means the domain is not verified or the from address is off-domain.

---

## Deployment checklist

```
[ ] Supabase project created
[ ] Migration applied
[ ] RLS verified enabled with zero policies
[ ] GitHub repo connected to Vercel
[ ] Environment variables set (Production / Preview / Development)
[ ] Service-role key set server-side only, never NEXT_PUBLIC_
[ ] First deployment succeeded
[ ] cardflare.gg added in Vercel
[ ] www.cardflare.gg added in Vercel
[ ] GoDaddy DNS records copied exactly from Vercel
[ ] Domain verified in Vercel
[ ] www redirects to apex
[ ] HTTPS active on both hostnames
[ ] Production waitlist submission stored in Supabase
[ ] Duplicate submission handled gracefully
[ ] Waitlist not readable via the public anon API
[ ] Open Graph preview renders when shared
[ ] (optional) Resend domain verified and confirmation email arriving
```

## Operational gotchas worth knowing before launch

**Supabase free-tier projects pause after a period of inactivity.** A paused
project refuses connections, so waitlist submissions would fail with the
generic error while the page still looks healthy. A pre-launch waitlist can
easily sit idle long enough to trigger this. Check Supabase's current free-tier
policy, and either keep the project active, move to a paid plan before
promoting the site, or check the table after any quiet stretch.

**Vercel's Hobby plan is for non-commercial use.** CardFlare is a commercial
project, so review Vercel's current plan terms and budget for Pro if the
project's use falls outside Hobby.

**Nothing alerts you if signups stop working.** Until monitoring exists, submit
a test signup yourself after any deployment and confirm the row lands in
Supabase.

## Rollback

Vercel keeps every deployment. **Deployments → ⋯ → Promote to Production** on
the last good build. The database migration is additive and does not need
rolling back.

## Local development

```bash
cp .env.example .env.local   # fill in Supabase values
npm install
npm run dev
```

Without Supabase values the site runs and the form validates, but submissions
return a generic error — which is exactly what the production code does when
misconfigured.

Before pushing:

```bash
npm run verify   # format check, lint, typecheck, unit tests, production build
npm run test:e2e
```

## Supabase SMTP for store sign-in

Two different senders leave CardFlare, and they fail independently:

| Email                                   | Sent by                   | Configured with                          |
| --------------------------------------- | ------------------------- | ---------------------------------------- |
| Waitlist confirmation, store invitation | Resend, from our own code | `RESEND_API_KEY`, `CARDFLARE_FROM_EMAIL` |
| Store sign-in magic link                | **Supabase Auth**         | Supabase project settings                |

An invitation arriving therefore proves nothing about sign-in. Supabase's
built-in email service is rate limited to a handful of messages per hour and is
documented as being for development only, so a store sign-in link may silently
fail to arrive even when everything in this repository is correct.

Point Supabase at the same Resend account:

1. Resend → **SMTP** → note the host, port `587`, username `resend`, and create
   or reuse an API key as the password.
2. Supabase → **Project Settings → Authentication → SMTP Settings** → enable
   custom SMTP and fill those in. Sender address must be on the verified
   domain — the same one as `CARDFLARE_FROM_EMAIL`.
3. Supabase → **Authentication → Email Templates → Magic Link** → reword so it
   reads as CardFlare rather than as Supabase.

Until step 1 is done, treat store sign-in as untested.
