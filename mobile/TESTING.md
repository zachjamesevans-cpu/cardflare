# Seeing the app

Everything in `mobile/` is checked by TypeScript and by unit tests that
read the source. Neither of those can look at a screen. That gap is not
theoretical: three glitches reached a real phone that one screenshot
would have caught.

- The Profile tab cropped forty-six pixels off the top of everybody's
  picture, from stale arithmetic in a margin.
- A profile border was stroked at a radius inside the avatar and drawn
  underneath it, so twenty-five rings people had bought were invisible.
- An avatar effect orbited inside the picture's own edge, which the
  founder saw as hearts "behind the avatar".

All three typechecked. All three shipped.

This file is how to close that gap. Three options, cheapest first.

## 1. Expo Go, on your own phone

The fastest look at a change, and it needs no Xcode.

```
cd ~/cardflare/mobile
npx expo start
```

Scan the QR code with the camera. Skia and Reanimated both ship inside
Expo Go for this SDK, so profile borders and avatar effects render.

What it will not show you: anything that depends on the production
build, push notifications, or a native module that is not in Expo Go.

## 2. The iOS Simulator, driven by Claude Code on your Mac

This is the one that turns "I found a glitch, fix it" into a loop that
does not need you in it. Claude Code runs as a CLI on your own machine,
where `xcrun` exists, so it can boot the simulator, install the app,
take a screenshot, look at it, change the code, and look again.

Install it once:

```
npm install -g @anthropic-ai/claude-code
```

Then start a session from the repo:

```
cd ~/cardflare && claude
```

The commands it will be reaching for:

```
xcrun simctl list devices available
```

```
xcrun simctl boot "iPhone 17 Pro" && open -a Simulator
```

```
cd ~/cardflare/mobile && npx expo run:ios
```

```
xcrun simctl io booted screenshot ~/Desktop/cardflare.png
```

`npx expo run:ios` needs Xcode and does a full native build, so the
first one takes a while. After that it is incremental.

## 3. Maestro, for the walk-through

The flows in [`.maestro`](./.maestro) open the app, sign in, walk every
tab, open a card and swipe it, and screenshot each step. See
[.maestro/README.md](./.maestro/README.md).

```
brew install maestro
```

```
cd ~/cardflare/mobile && maestro test .maestro -e EMAIL=you@example.com -e PASSWORD=...
```

Maestro drives the iOS Simulator without any extra setup. It can drive a
plugged-in iPhone too, but that needs a provisioning profile and their
device runner installed first, so the simulator is the loop and the
phone is where you confirm.

## What a cable does and does not get you

A plugged-in iPhone can be listed, have a build installed on it, be
launched, and have its logs read:

```
xcrun devicectl list devices
```

```
xcrun devicectl device process launch --device <udid> gg.cardflare.app
```

What it cannot do is let an arbitrary process tap the screen. iOS only
allows that from a signed UI-test runner, which is the extra setup
Maestro's device support is asking for. So automated tapping happens in
the Simulator; the phone is for looking.

## Honest note on this file

None of these commands were run while this file was written. The
environment it was written in is a Linux container with no Xcode, no
iOS Simulator, no Android SDK and no nested virtualisation, which is
the whole reason it exists. Treat the exact device names and the
Maestro selectors as first drafts to be corrected on contact, not as
verified output.
