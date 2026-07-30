# Exporting the waitlist to Google Sheets

**Supabase is the source of truth for waitlist data.** Google Sheets is a
convenience view for non-technical work — sorting by city to plan pilot
outreach, sharing a list with a store owner, and so on.

Do not make a spreadsheet the primary store, and do not let anything write back
into Supabase from Sheets.

## Recommended for launch: CSV export

No integration, no extra credentials, no new failure mode.

1. Supabase dashboard → **Table Editor** → `waitlist_signups`.
2. **Export** → **Download as CSV**.
3. In Google Sheets: **File → Import → Upload**, then choose
   _Replace current sheet_.

For a filtered export, run this in the SQL Editor and download the result:

```sql
select
  created_at,
  first_name,
  email,
  user_type,
  primary_game,
  city,
  region,
  store_name,
  comment
from public.waitlist_signups
where status = 'active'
  and marketing_consent = true
order by created_at desc;
```

### Before you share a sheet

The export contains personal data that people gave us for a specific purpose.

- Share with named people, never "anyone with the link".
- Do not paste it into a public Slack, Discord, or repository.
- Delete stale copies — a downloaded CSV does not honour later deletion requests.
- If someone asks to be deleted, delete them in **Supabase**, then re-export.
  Deleting a spreadsheet row does not delete the record.

## If manual export becomes tedious

Two options, in increasing order of effort. Neither is needed for launch, and
both are tracked in [ROADMAP.md](../ROADMAP.md).

### Option A — scheduled server-side sync

A Vercel Cron route reads new rows and appends them to a sheet via the Google
Sheets API.

- Use a **Google service account** and share the target sheet with its email.
- Store `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` as Vercel
  environment variables. Server-side only.
- Sync one direction only: Supabase → Sheets.
- Track a high-water mark (`created_at` of the last synced row) so reruns do not
  duplicate.
- Make it idempotent and let it fail loudly. A broken sync must never affect the
  signup path.

### Option B — Supabase webhook

A database webhook on insert posts to an Apps Script endpoint that appends a row.

Lower latency, but adds a per-signup external dependency. Only worth it if
near-real-time visibility genuinely matters.

## What not to do

- **Do not** put Google credentials in `NEXT_PUBLIC_*` variables.
- **Do not** call the Sheets API inside the waitlist Server Action. A Google
  outage would then break signups.
- **Do not** treat a sheet as authoritative for unsubscribes or deletions —
  those belong to the `status` column in Supabase.
