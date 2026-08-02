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

| Term            | Meaning                                              |
| --------------- | ---------------------------------------------------- |
| **Flare**       | A live request for a card                            |
| **Flare Match** | A match between a card request and an available card |
| **Event Room**  | A live digital room tied to a physical TCG event     |
| **Have List**   | Cards a player has available                         |
| **Need List**   | Cards a player is seeking                            |

## The core loop

This is the product. Protect it. Every feature should make one of these steps
faster or more likely to happen.

1. Store creates an event.
2. Player scans a QR code.
3. Player sends a Flare.
4. Another player has the card.
5. CardFlare creates a match.
6. Players meet and trade.

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
