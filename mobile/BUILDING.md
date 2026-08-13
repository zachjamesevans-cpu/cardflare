# Building CardFlare for a real phone

Two ways to get the app onto an iPhone without Expo Go. Both need the
Apple Developer Program (paid), which the founder has.

## The recommended path: EAS Build + TestFlight

EAS builds the app in Expo's cloud and hands Apple the signing. No Xcode
knowledge needed; the whole flow runs from this folder on a Mac.

One-time setup:

```
npm install -g eas-cli
eas login          # an Expo account; free, create one at expo.dev if needed
cd mobile
eas init           # links this folder to an EAS project (writes projectId into app.json)
```

Then, to put a build on TestFlight:

```
eas build --platform ios --profile production
eas submit --platform ios --latest
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

## Things that only exist in real builds

- Push notifications. Expo Go cannot receive CardFlare's push token;
  a built app can, once the APNs key exists (created during the first
  `eas build`).
- The custom splash screen and app icon.

## Version numbers

`eas.json` sets `appVersionSource: remote` with `autoIncrement` on the
production profile: EAS bumps the build number itself on every build, so
nobody edits app.json to ship. The human-readable `version` in app.json
(0.1.0) is changed by hand when it means something.
