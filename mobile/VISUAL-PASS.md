# The visual pass

This is the checklist for a Claude Code session running ON A MAC, with
Xcode installed, driving the iOS Simulator. It exists because the
sandbox that writes this app cannot see it: three TestFlight builds in a
row shipped bugs that typecheck clean, pass every test, render in
Chromium, and only misbehave in iOS WebKit. From now on nothing
app-side is called done until this pass has been run and LOOKED AT.

Read [TESTING.md](./TESTING.md) first for the tooling. The short
version:

```
xcrun simctl list devices available
xcrun simctl boot "iPhone 17 Pro" && open -a Simulator
cd mobile && npx expo run:ios
xcrun simctl io booted screenshot /tmp/shot.png
```

The first `expo run:ios` is a full native build and takes a while;
after that it is incremental. Sign in with the founder's account (ask
him, do not guess). Take a screenshot at every numbered step and
actually read each one - the failures this file exists for were all
visible in a single screenshot nobody took.

## 1. Profile tab: the worn cosmetics

Open Profile. The founder wears an uploaded SVG profile border (Haki)
and has worn catalogue rings and avatar effects.

- The profile picture is WHOLE - not cropped at the top. (A stale
  margin once cut 46px off every face.)
- The worn border draws AROUND the picture, animating, transparent
  background - no white square, no blank.
- **The app stays in the app.** Opening Profile once bounced straight
  out into Safari with the cosmetic's page in a tab: the WebView
  whitelist pattern was wrong, and the library's answer to a
  non-whitelisted URL is Linking.openURL. If Safari opens, that
  regression is back (mobile/src/cosmetic-film.tsx, originWhitelist -
  bare origin, no "/*").
- A catalogue ring spins; hearts/sparks float OUTSIDE the picture's
  edge, in front, not behind it.

## 2. Customize: the pickers show art

Profile -> wand icon ("Customize your profile"), then back and into the
showcase one.

- Profile borders: a live preview beside every row - a turning ring,
  not a line of text.
- Avatar effects: same, with moving particles.
- Card borders: a small bordered card beside every row. Rainbow,
  Aurora, Chrome, Milestone pan; Toxic and CRT Arcade pulse; Glitch
  and VHS twitch occasionally.
- KNOWN GAP, not a bug: Manga, Starfield, Lightning, Galaxy, Circuit
  Board, Cracked Stone, Gold Filigree, Lava Cracks draw as plain
  gradients - their particle textures are not ported yet.

## 3. Showcase cards

On Profile, the showcase rail.

- Every card wears the equipped border: a 4pt gradient edge with a
  glow, art inset inside it.
- Tap a card: the dressing modal previews with the same border. Zoom
  keeps it at full size.

## 4. The card zoom gesture

Feed -> tap a card image to zoom.

- Swiping left/right TURNS THE PAGE. It must not close the card. (The
  swipe flag used to be read before it was set; every swipe closed.)
- After swiping, ONE tap closes it. (The stale flag once ate the next
  tap.)

## 5. Rooms

Join or open a room with other players visible.

- Avatars in the roster wear rings/auras at small size without
  overlapping their neighbours.
- Decks posted in one paste group together, not thirty loose rows.

## Reporting

For each numbered section: PASS, or a screenshot plus one sentence on
what differs. Fix what you can locally (this is a working session, not
just an inspection), run `npx tsc --noEmit` in mobile/ and the
`tests/unit/app-*.test.ts` suite from the repo root before committing,
and follow the repo's committing rules in the root CLAUDE.md.

The Maestro flows in [.maestro](./.maestro) automate the walking (not
the judging): `maestro test .maestro -e EMAIL=... -e PASSWORD=...`.
Their selectors were written blind and may need one round of
correction with `maestro studio`.
