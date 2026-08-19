# Walking the app

These are [Maestro](https://maestro.dev) flows. They open CardFlare on a
simulator or a plugged-in phone, walk through it, and leave a folder of
screenshots behind.

They exist because everything in `mobile/` is verified by TypeScript and
by tests that read the source, and neither of those can see. Three
glitches reached the founder's phone that a single screenshot would have
caught: an avatar with the top of it cropped off, a profile border drawn
underneath the face it goes around, and an avatar effect orbiting behind
the picture.

## Running them

```
brew install maestro
maestro test .maestro -e EMAIL=you@example.com -e PASSWORD=...
```

Screenshots land in `shots/` next to wherever you ran it.

To run one flow while you work on it:

```
maestro test .maestro/02-card-zoom.yaml -e EMAIL=... -e PASSWORD=...
```

`maestro studio` opens an inspector against the running app, which is
the fastest way to find out what a tap should actually be aiming at.

## What they can and cannot tell you

They can tell you a screen opened, a control was reachable, and a
gesture did not close something it should have turned the page in. The
card zoom flow is that last one exactly.

They cannot tell you whether a ring is spinning, whether a gradient is
the right gradient, or whether a layout is ugly. That is what the
screenshots are for, and why the flows take so many of them.

## Two things that will need editing before they pass

Written against the source rather than against a running app, because
the environment they were authored in has no simulator - there is no
macOS and therefore no iOS Simulator anywhere near it. Two spots are
educated guesses and are the likely first failures:

- **The card tap in `02-card-zoom.yaml`** aims at a point, `50%,45%`,
  because a card tile is a picture with no text to match on. If the
  Feed's first card is somewhere else on your screen, `maestro studio`
  will tell you where.
- **The tab bar labels** are the navigator's route names. If a tab is
  ever relabelled in `App.tsx`, these go with it.
