# CardFlare for iOS and Android

The native client. Same backend, same accounts, same rooms as
[cardflare.gg](https://cardflare.gg) — every request goes through the
website's `/api/v1`, so nothing here can drift from the site. The app's
reason to exist is push: an offer landing on your Flare reaches your
lock screen.

Guests are untouched by this app existing. Scanning the counter code
with a phone camera still opens the website with nothing installed —
the app is for people who want their account in their pocket.

## One-time setup

Fill in `app.json` → `expo.extra` before the first run:

| Key               | Value                                                       |
| ----------------- | ----------------------------------------------------------- |
| `supabaseUrl`     | Supabase dashboard → Project Settings → API → Project URL   |
| `supabaseAnonKey` | Same page → `anon` `public` key                             |

Both are public values (the website ships them in its browser bundle);
RLS and the API's server-side checks protect the data. `apiBase` is
already `https://cardflare.gg`.

## Run it in development

```bash
cd mobile
npm install
npm start          # Expo dev server; press i for iOS simulator, a for Android
```

On a real phone, install **Expo Go** from the App Store and scan the QR
code `npm start` prints. Note: push notifications need a development
build (below), not Expo Go — everything else works in Expo Go.

## Build for TestFlight (needs the Apple Developer account)

Once enrollment clears:

```bash
npm install -g eas-cli
eas login                      # your Expo account (free)
eas build:configure            # writes eas.json, links the project id
eas build --platform ios       # first build; EAS walks through Apple signing
eas submit --platform ios      # uploads the build to TestFlight
```

EAS handles certificates and provisioning automatically with the Apple
account credentials. The bundle identifier is `gg.cardflare.app`.

## What is and isn't here yet

- ✅ Scan or type a code, join as guest or signed in, read the board,
  see your matches ("you have this"), offer on a Flare, confirm a trade
- ✅ Sign-in (same account as the website), account snapshot, inbox
- ✅ Push registration (`POST /api/v1/devices`) after sign-in
- ⏳ Posting a Flare from the app (the card picker screen)
- ⏳ Push *delivery* — the server-side worker that sends queued
  notifications to Expo's push service lands in the web repo once real
  device tokens exist to send to

Design tokens in `src/theme.ts` mirror the website's `@theme` block in
`src/app/globals.css`; the web values are the source of truth.
