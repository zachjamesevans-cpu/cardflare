# Building CardFlare for a real phone

Two ways to get the app onto an iPhone without Expo Go. Both need the
Apple Developer Program (paid), which the founder has.

## The recommended path: EAS Build + TestFlight

EAS builds the app in Expo's cloud and hands Apple the signing. No Xcode
knowledge needed; the whole flow runs from this folder on a Mac.

One-time setup is already done: the folder is linked to EAS project
`db32fc46-52f1-443f-9960-c9b17a2f7f4e` (the id lives in app.json under
`extra.eas.projectId`, where push registration also reads it). Run every
`eas` command as `npx eas-cli@latest ...` rather than installing the CLI
globally; a global install needs permissions the Mac's npm does not have.

To put a build on TestFlight:

```
cd mobile
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --latest
```

The first `eas build` asks to sign in with the Apple ID on the developer
account, registers the bundle id (`gg.cardflare.app`), and offers to
create the signing certificate and the push notification key. Say yes to
all of it; Expo stores them and reuses them on every later build. The
push key matters: notifications only work in real builds, never in Expo
Go, so this is also the moment push starts being real.

`eas submit` uploads the finished build to App Store Connect. It appears
under TestFlight after Apple's automated processing (usually minutes,
occasionally an hour). Add yourself as an internal tester in App Store
Connect once, install the TestFlight app on the phone, and every future
build is a push away.

## The direct path: cable + Xcode

For a same-day install without TestFlight's processing wait:

```
cd mobile
npx expo run:ios --device
```

This generates the native project, builds it locally (needs Xcode
installed, with the iOS platform downloaded), and installs straight onto
the phone plugged in over USB. The first run asks Xcode to sign with the
developer team; pick the Apple Developer account in the signing prompt.
Fine for quick personal testing; TestFlight is the path that scales to
other people's phones.

Apple's export-compliance question is answered permanently in app.json
(`ITSAppUsesNonExemptEncryption: false` - the app uses only standard
HTTPS), so neither `eas build` nor App Store Connect asks it again.

## Things that only exist in real builds

- Push notifications. Expo Go cannot receive CardFlare's push token;
  a built app can, once the APNs key exists (created during the first
  `eas build`). Registration passes the EAS projectId explicitly -
  without it, `getExpoPushTokenAsync` throws in standalone builds and
  push dies silently.
- The custom splash screen and app icon.

The holofoil is NOT on this list: `@shopify/react-native-skia` ships
inside Expo Go for this SDK, so the blend-mode foil in `src/foil.tsx`
renders in Expo Go and TestFlight alike. If a binary is ever built
without Skia, cosmetic-card.tsx falls back to the old
translucent-gradient wash instead of crashing.

## Deliberately absent: expo-dev-client

This project does not use development builds; the workflow is Expo Go
for day-to-day and TestFlight for real installs. `expo-dev-client` was
briefly a dependency and compiled its native launcher into the store
binary, where it sat in the launch path of builds that never wanted
it. Keep it out unless the team actually adopts development builds,
and if it returns, restore the `development` profile in eas.json with
`"developmentClient": true` alongside it.

## Version numbers

`eas.json` sets `appVersionSource: remote` with `autoIncrement` on the
production profile: EAS bumps the build number itself on every build, so
nobody edits app.json to ship. The human-readable `version` in app.json
(0.1.0) is changed by hand when it means something.
