# cardflare on Android

The app is Expo / React Native, so Android is the same code built a
second way, not a second app. This is everything needed to ship it on
Google Play: what the founder does, what gets built, the store listing,
and the checks to run in an emulator before anyone outside sees it.

Started 2026-11-25. Branch `android-prep`.

## Status

| Piece | State |
| --- | --- |
| Android package name `gg.cardflare.app`, adaptive icon | Done (was already set) |
| Build profiles: `production` makes a Play bundle (.aab), `android-test` an installable .apk | Done (`mobile/eas.json`) |
| Keyboard resizes the screen; no microphone, no background location | Done (`mobile/app.json`) |
| Push notifications (Firebase key) | Waiting on the founder: see 3 below |
| Android tools + emulator on the Mac | After build 97 uploads (disk space) |
| First Android build, looked at in the emulator | After the emulator |
| Google Play listing, Data safety, content rating | Text drafted below |
| Closed test, 12 testers, 14 days | Waiting on the Play account |

## What the founder does

1. **Google Play Console account.** <https://play.google.com/console/signup>.
   $25 once. Choose **Organization** if cardflare has (or can get) a
   free D-U-N-S number: organization accounts skip the closed-test
   rule below. A **Personal** account is quicker to open but must run
   the closed test first. Identity verification takes a few days.
2. **Closed test (personal accounts).** Google requires at least 12
   testers opted in for 14 days in a row before the app can go public.
   (Check the number in the Console when signing up; Google has
   changed it before.) Ask 12+ friends for the Gmail address on their
   Android phone; they join through a link and keep the app installed.
3. **Firebase, for push notifications.** Pushes already go through
   Expo's push service, which sends to Android through Firebase:
   1. <https://console.firebase.google.com> → Add project → "cardflare".
   2. Add an Android app with package `gg.cardflare.app`; download
      `google-services.json` and send it over (it goes in `mobile/`).
   3. Project settings → Service accounts → "Generate new private key";
      upload that file with `npx eas credentials` (Android → Google
      Service Account → push notifications). Claude walks through this.
4. **Screenshots.** Play wants at least 2 phone screenshots (up to 8);
   they come from the emulator once the app runs there.
5. **Feature graphic.** 1024 × 500, shown at the top of the listing.
   The logo on the brand green works.

## What gets built (Claude)

1. Install Android Studio's command-line tools and one emulator image
   (about 10 GB; after build 97 so the iOS build keeps its disk).
2. `npx eas build -p android --profile android-test --local` → an .apk
   to install on the emulator and on any Android phone.
3. The emulator pass below; fix what it finds on this branch.
4. `npx eas build -p android --profile production --local` → the .aab
   uploaded to the Play Console's closed-testing track.

### The emulator pass

Things written for iOS first, each to be looked at on Android:

- **Sheets fitted to their contents** (the card sheet, the composer:
  `presentation: "formSheet"`, `sheetAllowedDetents: "fitToContents"`
  in `mobile/App.tsx`). react-native-screens supports form sheets on
  Android, but fitting to contents needs seeing; the fallback is a
  plain modal.
- **Blur** behind the card zoom and the action sheets (`expo-blur`).
  On Android it is a darkened tint unless the experimental blur is
  switched on; check it reads well as a dim.
- **The keyboard**: composer caption, messages, the offer field. The
  `KeyboardAvoidingView`s act on iOS only; Android resizes the window
  (`softwareKeyboardLayoutMode: "resize"`).
- **Back**: the hardware/gesture back button closes sheets and pops
  screens; a sheet should close before the screen under it.
- **Haptics**: lighter on most Android phones; nothing to change.
- **Push**: arrives, opens the right thread or post when tapped. The
  iOS notification-service extension (faces on pushes) has no Android
  part; Android shows the image from the push itself.
- **The camera** scanner and the QR code reader.
- **Location**: the permission prompt, "Use my location" on Nearby.
- **Fonts and the tab bar** at Android's default text size and at the
  largest one.
- **In-app purchases** are hidden (Pro is off); nothing to do until
  they come back, then Google Play Billing products have to be made.

## Store listing (draft)

**App name** (30 max): `cardflare`

**Short description** (80 max):
`Find the cards you're hunting. Trade with players near you.`

**Full description:**

> cardflare is where trading card players find each other.
>
> Post a Flare for the cards you're hunting, and players near you who
> have them can raise a hand. Put your binder up for trade, and people
> looking for what you have find you. Meet up, trade in person, done.
>
> • Flares: say what you're looking for in seconds. Each art is its own
>   card, so the alt art you want is the one people see.
> • Nearby: Flares and traders around you, by distance.
> • Binders: show what you have, and what's up for trade.
> • Market prices for every card and printing, with the week's move.
> • Game hubs: the most hunted, most searched and biggest price moves
>   for each game.
> • Store rooms: scan the code at your local game store's counter and
>   post into tonight's event.
> • Messages, so a trade gets sorted before you meet.
>
> One Piece, Pokémon, Magic: The Gathering, Lorcana, Riftbound and
> Gundam.
>
> Your exact location is never saved: only your approximate area (ZIP
> code), with the posts you make.

**Category:** Social (or Entertainment). **Tags:** trading cards,
TCG, collecting.

**Contact email:** the support address on <https://cardflare.gg/contact>.
**Website:** <https://cardflare.gg>.
**Privacy policy:** <https://cardflare.gg/privacy>.
**Terms:** <https://cardflare.gg/terms>.

## Data safety (draft answers)

Google's form, answered from what the app actually does. Confirm each
before submitting.

- **Encrypted in transit:** Yes (HTTPS everywhere).
- **Account deletion:** Yes. In the app (Settings → Delete account)
  and on the web at <https://cardflare.gg/profile/settings>; Google asks
  for a web link, and that is it.
- **Collected and linked to the account:**
  - Personal info: **email address**, **name** (display name and
    handle). Purpose: account management, app functionality.
  - Photos: **profile picture** (chosen by the user). Purpose: app
    functionality.
  - Location: **approximate location** (ZIP area). Purpose: app
    functionality (Flares and traders nearby). Not precise: the exact
    position is used on the phone to find the area and never stored.
  - Messages: **other in-app messages** (player to player). Purpose:
    app functionality.
  - App activity: **other user-generated content** (Flares, binders,
    hunts, captions). Purpose: app functionality.
  - Device IDs: **push notification token**. Purpose: app functionality
    (notifications).
- **Camera images** for card scanning are sent to read the card and
  not kept as the user's data; declare under Photos if Google's
  definition requires it.
- **Not collected:** payment info (no purchases), contacts, health,
  precise location, browsing history, audio.
- **Shared with third parties:** No selling. Service providers
  (hosting, database, Expo push) are not "sharing" under Google's
  definition.
- **Card opens** for the game hubs are counted per card per day with
  nothing about who: not collected as user data.
- **Crash or analytics SDKs:** none in the app today.

## Content rating

The IARC questionnaire: no violence, no sexual content, no gambling,
no drugs. **Users can interact** (messages, posts) and **share
approximate location**: yes to both. Expect a Teen / PEGI 12 rating
because of open user messaging; reporting and blocking exist in the app.
