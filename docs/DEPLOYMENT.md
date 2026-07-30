# CardFlare — Deployment

Everything here needs access to Supabase, Vercel and GoDaddy, so it is done by
the project owner. Work top to bottom; the checklist at the end mirrors these
steps.

> **DNS values are never written down in this repository.** Vercel shows the
> exact records for your project. Copy them from the Vercel dashboard at the
> time you add the domain — do not copy them from a tutorial, and do not trust
> any values quoted from memory.

---

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

## 3. Authentication URLs

Milestone 1 uses no Supabase Auth, so **no configuration is required now**.
When Milestone 2 adds authentication, set **Authentication → URL Configuration
→ Site URL** to `https://cardflare.gg` and add preview URLs as redirect URLs.

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
```

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
