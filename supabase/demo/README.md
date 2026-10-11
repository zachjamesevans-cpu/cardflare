# The demo world

A separate, throwaway Supabase project filled with believable players, so
the real app can be photographed for the App Store and for marketing.
The founder (2026-10-11): "almost code test rooms that look real".

**Never production.** Fake players in the real database would turn up in
real people's rooms, feeds and Nearby. Every `npm run demo` command
refuses the production project before it connects.

## What is in it

`seed.sql`, run by `npm run demo -- seed`, makes:

- **The hero**, `hero@demo.cardflare.gg`, named by `DEMO_HERO_NAME`. Pro,
  wearing a Galaxy ring, a Holographic nameplate, a title, a badge and a
  scene; a showcase of six cards; twelve followers.
- **Grand Line Games**, a fictional store in Austin, TX, with a live
  One Piece Locals room tonight (code `SHANKS`) and nights later in the
  week.
- **Twelve players** in that room with cards they want and cards they
  have, arranged so the hero has matches both ways.
- **The Feed**: Flares from the people the hero follows, both looking for
  and letting go, minutes to hours old, with hearts and comments. No
  prices anywhere.
- **The trade binder**: three pages of popular One Piece cards in exact
  pockets.
- **Messages**: a conversation with Jordan Kim that ends with a trade
  both of them confirmed, and two more threads.

Everything is timed from the moment it runs, so run it again right
before taking screenshots: "here now" in a room means seen in the last
fifteen minutes. It deletes its own previous rows first, so it is safe to
run any number of times.

## Setting it up, once

1. **A new Supabase project.** supabase.com, New project, name it
   `cardflare-demo`, free plan. Choose a database password and keep it in
   your password manager.
2. **The settings.** `cp .env.demo.example .env.demo` and fill it in from
   the demo project's dashboard (the template says where each one is).
   `.env.demo` is gitignored. Keys go in that file, never in a chat.
3. **Tools.** Xcode with an iPhone Pro Max simulator, and Maestro:
   `brew install maestro`.
4. **The world.** `npm install`, then `npm run demo -- all`. It applies
   every migration, imports the real One Piece catalogue (the slow part,
   several minutes), creates the thirteen accounts, and seeds.

## Taking the screenshots

1. **The website, on this Mac:** `npm run demo:web` (leave it running).
   The app talks to it, and it talks to the demo project.
2. **The app, in the simulator:** in a second terminal,
   `cd mobile && npm run demo -- --device "iPhone 17 Pro Max"` (or
   whichever Pro Max your Xcode has: `xcrun simctl list devices`). The
   first build takes a while.
3. **A clean status bar:**
   `xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3`
4. **Fresh data:** `npm run demo -- seed`.
5. **The shots:** `cd mobile && maestro test .maestro/app-store -e EMAIL=hero@demo.cardflare.gg -e PASSWORD=<DEMO_PASSWORD>`.
   Five pictures land in `mobile/shots/app-store/`, at the simulator's
   own size (1320 x 2868 on a 6.9-inch Pro Max, what App Store Connect
   asks for).

The flow was written without a simulator to try it on. If a tap misses,
`maestro studio` shows what the screen calls each control.

## Things to know

- The hero owns every draft cosmetic in this project (they are all drafts
  after migrations, and the seed grants the hero the same "owns drafts"
  access the founder's account has), so Customize shows everything as
  owned.
- Pro is set on the player, not through a subscription, so the Pro screen
  has no renewal line.
- The cards are Bandai's art from the real catalogue.
- A card number the catalogue does not have is skipped, and the seed says
  which in its first line of output.
