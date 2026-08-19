# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Nothing here has been seen until somebody looks

The app has no renderer in the test run. `npx tsc --noEmit` and the unit
tests in `tests/unit/app-*.test.ts` read the source; they cannot tell you
that a layer is drawn under an opaque face, or that a margin cropped
somebody's picture, and both of those have shipped.

So: a visual change to the app is not done when it typechecks. Read
[TESTING.md](./TESTING.md) and put it in front of a simulator, Expo Go or
a device before saying it works.

Geometry that decides where a worn cosmetic lands belongs in
`src/avatar-geometry.ts`, not in a component, so
`tests/unit/app-avatar-geometry.test.ts` can check it against the
stylesheet the website draws from.
