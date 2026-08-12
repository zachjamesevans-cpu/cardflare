# CardFlare — Product Definition

**Domain:** https://cardflare.gg
**Initial supported game:** One Piece Card Game
**Primary platform:** Mobile-first web application

## What CardFlare is

CardFlare helps players at physical TCG events find cards available from other
people in the same room.

Players join a live event through a QR code, post cards they need as **Flares**,
list cards they have available, receive real-time matches, and coordinate an
in-person trade.

CardFlare is a live trading layer for local game stores, tournaments,
conventions, and TCG communities.

## What CardFlare is not

These are out of scope. Adding any of them is a product decision that needs
explicit approval, not an implementation detail.

- A collection tracker
- A deck builder
- A nationwide marketplace
- A shipping platform
- A card-pricing application

## Core product language

Use these terms consistently in code, UI copy, and documentation.

| Term               | Meaning                                                               |
| ------------------ | --------------------------------------------------------------------- |
| **Flare**          | A live request for a card                                             |
| **Flare Match**    | A match between a card request and an available card                  |
| **Event Room**     | A live digital room tied to a physical TCG event                      |
| **Counter Code**   | A store's permanent join code, printed once and left on the counter   |
| **Walk-in Room**   | The Event Room a Counter Code opens when no event is scheduled        |
| **Card Show**      | A show with many vendors and one scannable code                       |
| **Vendor**         | A card-show seller: inventory, a booth, no rooms                      |
| **Booth**          | Where a vendor sits at one show — what attendees walk to              |
| **Slab**           | A graded card in a case: PSA, BGS, CGC, with a grade on the label     |
| **Have List**      | Cards a player has available                                          |
| **Need List**      | Cards a player is seeking                                             |
| **Open to trades** | A player who wants no card in particular and will consider anything   |
| **Showcase**       | A Flare pointed the other way: a card the poster will let go          |
| **Terms**          | Whether a Flare is answerable with a trade, with cash, or with either |

## Direction, and why the board says it in words

Every Flare points one of two ways: **looking for** a card, or **letting
one go**. Both are rows on the same board, grouped under the same player,
because a room's real question is "who do I walk over to, and about what".

The direction is always stated as text under a heading, never as a
texture. The first attempt marked showcases with a holofoil sheen and it
was wrong: in TCG culture foil means _rare and special_, not _available_.
It was removed. A visual flourish can decorate a direction; it can never
carry one.

Terms are the second half of that question. A player walking over needs
to know whether to bring cards or money, so a Flare records whether it
is answerable by a trade, by cash, or by either. Trade-only is the
assumed default and is deliberately silent on the board.

**Never a price.** A flag says something about the person standing in the
room; a number turns CardFlare into a marketplace, which is on the
out-of-scope list above.

## Parked: profiles and standing

Two ideas that belong to a later milestone, recorded so they are not
reinvented piecemeal:

- **Profiles**, where a player's showcase is a permanent shelf rather
  than a room-scoped post. This is where foil earns its place, because
  on a profile "rare and special" is exactly the message.
- **Standing**, earned from _completed trades_ and never from posting.
  Rewarding posts fills boards with noise, and a raw trade count is
  farmable by two friends confirming each other all afternoon, so any
  such score has to weigh distinct partners, rooms and stores.

## The core loop

This is the product. Protect it. Every feature should make one of these steps
faster or more likely to happen.

1. Store puts up a code. Once, permanently — or per event, if the event
   deserves its own sheet.
2. Player scans a QR code.
3. Player sends a Flare.
4. Another player has the card.
5. CardFlare creates a match.
6. Players meet and trade.

Step 1 used to require a store to create an event before anything could
happen, which meant nothing happened on the ordinary afternoons that make up
most of a store's week. A store now prints one Counter Code and the room takes
care of itself.

## Users

| User type            | What they want                                                       |
| -------------------- | -------------------------------------------------------------------- |
| Player               | Complete a deck before the next round without searching every binder |
| Local game store     | A better event experience and a reason for players to come back      |
| Tournament organiser | Smoother trading at larger events                                    |
| Content creator      | A community hook around local play                                   |

## Current status

**Milestone 1 (public splash page and waitlist) is live at
https://cardflare.gg.** Event rooms, authentication, card search and Flares are
built; matching and trading are not. Steps 1 to 4 of the core loop work, with
step 4 done by a player reading the room's Flare board rather than by the
application. See [ROADMAP.md](./ROADMAP.md) for the sequence.

The landing page must not imply the product has launched. Copy says CardFlare
"is currently being built and preparing for its first local-store pilots".

## Product principles

- **In-person first.** CardFlare coordinates a meeting; it never handles
  shipping, payment, or escrow.
- **No fake functionality.** A control that looks interactive must work. The
  landing page's app previews are marked as illustrations to assistive
  technology precisely because their chips are not real controls.
- **Honest about risk.** CardFlare does not verify card authenticity,
  condition, value, or trade fairness, and says so in the Terms.
- **Respect the venue.** Trades belong to the store hosting them. CardFlare
  runs alongside an event, never instead of it.
