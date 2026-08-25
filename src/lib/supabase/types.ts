/**
 * Hand-maintained mirror of the SQL in supabase/migrations.
 *
 * Regenerate with the Supabase CLI once convenient:
 *   npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts
 *
 * These must be `type` aliases rather than `interface`s: supabase-js constrains
 * the schema to `Record<string, ...>`, and only type aliases receive an implicit
 * index signature. Using an interface makes the schema silently resolve to
 * `never` and every query lose its types.
 */
import type { UserType } from "@/lib/waitlist/schema";

export type WaitlistStatus = "active" | "unsubscribed" | "bounced";
export type StoreStatus = "invited" | "active" | "paused";
/** lgs runs rooms and events; vendor brings inventory to card-show booths. */
export type StoreKind = "lgs" | "vendor";
export type StoreRole = "owner" | "staff";

export type WaitlistSignupRow = {
  id: string;
  created_at: string;
  first_name: string;
  email: string;
  user_type: UserType;
  primary_game: string | null;
  city: string | null;
  region: string | null;
  store_name: string | null;
  comment: string | null;
  marketing_consent: boolean;
  source: string | null;
  referral_code: string | null;
  status: WaitlistStatus;
};

export type WaitlistSignupInsert = Omit<
  WaitlistSignupRow,
  "id" | "created_at" | "status"
> & {
  id?: string;
  created_at?: string;
  status?: WaitlistStatus;
};

export type StoreRow = {
  id: string;
  created_at: string;
  name: string;
  /** Null for an unclaimed listing: nobody has told us one. */
  contact_email: string | null;
  city: string | null;
  region: string | null;
  status: StoreStatus;
  is_pilot: boolean;
  /** The permanent code on the counter. Seven characters, never rotated. */
  join_code: string;
  walk_in_enabled: boolean;
  /** IANA name. Turns a typed event time into an instant, and back. */
  timezone: string;
  kind: StoreKind;
  /** Hours before start that a scheduled board accepts Flares. 0 = off. */
  early_board_hours: number;
  /* Where it is. Null on every row that predates the directory, and on
     any customer never asked. Precise coordinates never leave the
     server - distance is computed and rounded server-side. */
  address_line: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  /** Where it sits in the funnel. An existing customer is `claimed`. */
  claim_status: StoreClaimStatus;
  /** The commercial tier, kept apart from verification on purpose. */
  tier: StoreTier;
  /** Draft keeps an imported candidate away from players until approved. */
  listing_state: StoreListingState;
  /** Trust. Admin-only, never for sale, never inferred from `tier`. */
  verified_at: string | null;
  verified_by: string | null;
};

/** Columns with database defaults are optional on insert. */
export type StoreInsert = Omit<
  StoreRow,
  | "id"
  | "created_at"
  | "status"
  | "is_pilot"
  | "walk_in_enabled"
  | "timezone"
  | "kind"
  | "early_board_hours"
  /* Everything the directory added. All defaulted in the migration, so
     an insert that predates the directory stays valid. */
  | "address_line"
  | "postal_code"
  | "country"
  | "latitude"
  | "longitude"
  | "phone"
  | "website"
  | "claim_status"
  | "tier"
  | "listing_state"
  | "verified_at"
  | "verified_by"
> & {
  address_line?: string | null;
  postal_code?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  website?: string | null;
  claim_status?: StoreClaimStatus;
  tier?: StoreTier;
  listing_state?: StoreListingState;
  /* Deliberately absent from the insert shape as writable-by-anything:
     verification is set by an admin action, never by a create. */
  verified_at?: never;
  verified_by?: never;
  walk_in_enabled?: boolean;
  timezone?: string;
  kind?: StoreKind;
  early_board_hours?: number;
  id?: string;
  created_at?: string;
  status?: StoreStatus;
  is_pilot?: boolean;
};

/**
 * What an admin may change about a store after it exists.
 *
 * Everything an insert may set, plus the three an insert may NOT:
 * `listing_state` publishes a discovered draft, `verified_at` records
 * that cardflare confirmed who controls the profile, and `tier` is the
 * commercial product. All three are set by a person, behind
 * `requireAdmin`, and never accepted from a client payload.
 */
export type StoreUpdate = Partial<Omit<StoreInsert, "verified_at" | "verified_by">> & {
  listing_state?: StoreListingState;
  verified_at?: string | null;
  verified_by?: string | null;
  tier?: StoreTier;
};

export type StoreMemberRow = {
  store_id: string;
  user_id: string;
  role: StoreRole;
  created_at: string;
};

export type StoreMemberInsert = Omit<StoreMemberRow, "created_at" | "role"> & {
  role?: StoreRole;
  created_at?: string;
};

export type StoreInviteRow = {
  id: string;
  store_id: string;
  email: string;
  created_at: string;
  invited_by: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
};

export type StoreInviteInsert = Omit<
  StoreInviteRow,
  "id" | "created_at" | "accepted_at" | "accepted_by"
> & {
  id?: string;
  created_at?: string;
  accepted_at?: string | null;
  accepted_by?: string | null;
};

export type CardRow = {
  id: string;
  created_at: string;
  updated_at: string;
  game: Game;
  canonical_card_number: string;
  compact_card_number: string;
  /** The provider's display name, verbatim. Never rewritten. */
  exact_name: string;
  normalized_name: string;
  card_type: string | null;
  colors: string[];
  traits: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  rarity: string | null;
  /** One Piece attribute — Slash, Strike, Special, Wisdom, Ranged. */
  attribute: string | null;
  effect_text: string | null;
  trigger_text: string | null;
  provider_key: string;
  provider_external_id: string | null;
  raw_metadata: unknown;
  provider_updated_at: string | null;
};

export type CardInsert = Omit<CardRow, "id" | "created_at" | "game"> & {
  id?: string;
  created_at?: string;
  game?: Game;
};

export type CardPrintingRow = {
  id: string;
  created_at: string;
  updated_at: string;
  card_id: string;
  provider_key: string;
  provider_external_id: string;
  set_code: string | null;
  set_name: string | null;
  printing_label: string | null;
  variant_type: string | null;
  /** Rarity of this printing. A base art and an alternate art differ here. */
  rarity: string | null;
  /** The provider's name for this printing, e.g. "Kouzuki Oden (SPR)". */
  printing_name: string | null;
  /** The provider's own image identifier, when it has one. */
  image_id: string | null;
  /** Which endpoint group produced the record: set, starter-deck, promo, don. */
  provider_source: string | null;
  /** Three-valued: null means the provider did not classify the printing. */
  is_alternate_art: boolean | null;
  is_promo: boolean | null;
  is_parallel: boolean | null;
  is_reprint: boolean | null;
  language: string;
  /** Provider-supplied only. Never inferred, never rewritten. */
  image_url: string | null;
  raw_metadata: unknown;
  provider_updated_at: string | null;
};

export type CardPrintingInsert = Omit<
  CardPrintingRow,
  "id" | "created_at" | "language"
> & { id?: string; created_at?: string; language?: string };

export type CardAliasRow = {
  id: string;
  card_id: string;
  alias: string;
  source: string;
};
export type CardAliasInsert = Omit<CardAliasRow, "id" | "source"> & {
  id?: string;
  source?: string;
};

export type SyncStatus = "running" | "succeeded" | "failed";
export type SyncMode = "sample" | "full";

export type CardSyncRunRow = {
  id: string;
  provider_key: string;
  mode: SyncMode;
  status: SyncStatus;
  started_at: string;
  finished_at: string | null;
  records_seen: number;
  cards_upserted: number;
  printings_upserted: number;
  records_failed: number;
  notes: string | null;
};

export type CardSyncRunInsert = Omit<
  CardSyncRunRow,
  | "id"
  | "status"
  | "started_at"
  | "finished_at"
  | "records_seen"
  | "cards_upserted"
  | "printings_upserted"
  | "records_failed"
  | "notes"
> &
  Partial<CardSyncRunRow>;

export type CardSyncFailureRow = {
  id: string;
  run_id: string;
  provider_external_id: string | null;
  reason: string;
  raw_record: unknown;
  created_at: string;
};

export type CardSyncFailureInsert = Omit<CardSyncFailureRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

/** One row of `search_cards`: a card plus its relevance score. */
export type CardSearchRow = Pick<
  CardRow,
  | "id"
  | "canonical_card_number"
  | "exact_name"
  | "card_type"
  | "colors"
  | "traits"
  | "cost"
  | "power"
  | "counter"
  | "life"
  | "rarity"
  | "attribute"
  | "effect_text"
  | "trigger_text"
> & { score: number };

export type ShowRow = {
  id: string;
  created_at: string;
  created_by: string | null;
  name: string;
  city: string | null;
  region: string | null;
  timezone: string;
  starts_at: string;
  ends_at: string;
  join_code: string;
};

export type ShowInsert = Omit<ShowRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type ShowVendorRow = {
  show_id: string;
  store_id: string;
  booth: string;
  created_at: string;
};

export type ShowVendorInsert = Omit<ShowVendorRow, "created_at"> & {
  created_at?: string;
};

export type InventoryForm = "raw" | "slab";

/** A vendor's stock: raw singles and graded slabs. No prices, per PRODUCT.md. */
export type VendorInventoryRow = {
  id: string;
  created_at: string;
  updated_at: string;
  store_id: string;
  card_id: string;
  printing_id: string | null;
  form: InventoryForm;
  grader: string | null;
  /** Null on a slab means the case says "Authentic" rather than a number. */
  grade: number | null;
  quantity: number;
};

export type VendorInventoryInsert = Omit<
  VendorInventoryRow,
  "id" | "created_at" | "updated_at" | "quantity"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  quantity?: number;
};

export type StoreSingleRow = {
  id: string;
  created_at: string;
  store_id: string;
  card_id: string;
  quantity: number;
};

export type StoreSingleInsert = Omit<StoreSingleRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type StoreSinglesSyncRow = {
  store_id: string;
  synced_at: string;
  lines_seen: number;
  cards_matched: number;
  lines_unmatched: number;
};

export type StoreSinglesSyncInsert = Omit<StoreSinglesSyncRow, "synced_at"> & {
  synced_at?: string;
};

export type EventStatus = "draft" | "open" | "closed";
export type Game = "one_piece";

/**
 * `walk_in` rooms are opened by the application when somebody scans a store's
 * permanent code, so they have no planned end and no code of their own — both
 * columns are null for them, and the database enforces that.
 */
export type EventKind = "scheduled" | "walk_in";

export type EventRow = {
  id: string;
  created_at: string;
  store_id: string;
  created_by: string | null;
  name: string;
  game: Game;
  kind: EventKind;
  starts_at: string;
  ends_at: string | null;
  status: EventStatus;
  join_code: string | null;
  /** When true, closing this occurrence creates the next one, +7 days. */
  repeat_weekly: boolean;
};

export type EventInsert = Omit<
  EventRow,
  "id" | "created_at" | "status" | "game" | "kind" | "repeat_weekly"
> & {
  id?: string;
  created_at?: string;
  status?: EventStatus;
  repeat_weekly?: boolean;
  game?: Game;
  kind?: EventKind;
};

export type EventParticipantRow = {
  id: string;
  event_id: string;
  player_session_id: string;
  joined_at: string;
  last_seen_at: string;
  /** Not after anything specific. Public to the room. */
  open_to_trades: boolean;
};

export type EventParticipantInsert = Omit<
  EventParticipantRow,
  "id" | "joined_at" | "last_seen_at" | "open_to_trades"
> & {
  id?: string;
  joined_at?: string;
  last_seen_at?: string;
  open_to_trades?: boolean;
};

export type FlareStatus = "open" | "cancelled" | "traded";

/** A live request for a card, in one Event Room. Public to that room. */
export type FlareIntent = "want" | "showcase";

export type FlareRow = {
  id: string;
  created_at: string;
  updated_at: string;
  event_id: string;
  player_session_id: string;
  status: FlareStatus;
  card_id: string;
  /** Null means any printing will do. */
  printing_id: string | null;
  quantity: number;
  note: string | null;
  /** Groups a player's Flares under a named hunt ("RG Luffy"). Null = loose. */
  deck_label: string | null;
  /**
   * The posting action that created this Flare. Shared by every Flare
   * posted in one go, so a deck notifies once and reads as one Feed
   * item. Null for a lone post and for anything posted before batches.
   */
  posted_batch: string | null;
  /** Which way the card points: wanted, or offered up. */
  intent: FlareIntent;
  /** The poster will trade cards. On a showcase, will trade it away. */
  accepts_trade: boolean;
  /** The poster will use money. Never a price. */
  accepts_cash: boolean;
};

export type FlareInsert = Omit<
  FlareRow,
  | "id"
  | "created_at"
  | "updated_at"
  | "status"
  | "quantity"
  | "deck_label"
  | "intent"
  | "accepts_trade"
  | "accepts_cash"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  status?: FlareStatus;
  quantity?: number;
  deck_label?: string | null;
  intent?: FlareIntent;
  accepts_trade?: boolean;
  accepts_cash?: boolean;
};

/**
 * A holder's offer to answer a Flare — the moment they choose to be found.
 *
 * Carries nothing from the responder's binder: not the printing, not the
 * quantity. An offer is a hand raised, not an inventory disclosure.
 */
export type FlareResponseRow = {
  id: string;
  created_at: string;
  flare_id: string;
  responder_session_id: string;
  /** "Table 12". Optional, short, and the only thing the responder says. */
  message: string | null;
  /** How many copies they say they can bring. Defaults to one. */
  quantity: number;
};

export type FlareResponseInsert = Omit<
  FlareResponseRow,
  "id" | "created_at" | "quantity"
> & {
  id?: string;
  created_at?: string;
  quantity?: number;
};

/**
 * A confirmed in-person trade. A tally mark with names on it.
 *
 * The session, flare and printing references are nullable because history
 * outlives its pointers: sessions expire in 30 days by design, and a store's
 * event numbers must not quietly shrink as they do.
 */
export type TradeRow = {
  id: string;
  event_id: string;
  flare_id: string | null;
  requester_session_id: string | null;
  holder_session_id: string | null;
  card_id: string;
  printing_id: string | null;
  quantity: number;
  confirmed_at: string;
};

export type TradeInsert = Omit<TradeRow, "id" | "confirmed_at" | "quantity"> & {
  id?: string;
  confirmed_at?: string;
  quantity?: number;
};

/**
 * A player's trade binder. Follows the player, not the event.
 *
 * No `event_id` and no `status`: it is not scoped to a room, and a card is
 * either in the binder or removed from it.
 */
export type PlayerCardRow = {
  id: string;
  created_at: string;
  updated_at: string;
  player_session_id: string;
  card_id: string;
  printing_id: string | null;
  quantity: number;
  note: string | null;
  /** When the player last confirmed they still have this. */
  confirmed_at: string;
};

export type PlayerCardInsert = Omit<
  PlayerCardRow,
  "id" | "created_at" | "updated_at" | "quantity" | "confirmed_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  quantity?: number;
  confirmed_at?: string;
};

export type PlayerSessionRow = {
  id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  display_name: string;
  /** SHA-256 of the cookie token. The token itself is never stored. */
  token_hash: string;
  /** The account this session belongs to; null for a guest. */
  player_id: string | null;
};

/**
 * An extra token that resolves to a session.
 *
 * One identity, several devices. A second client signing in as an account
 * that is already in a room adopts that room identity and is handed one of
 * these, rather than minting a rival session and appearing on the board
 * twice.
 */
export type PlayerSessionTokenRow = {
  token_hash: string;
  player_session_id: string;
  created_at: string;
};

export type PlayerSessionTokenInsert = Omit<PlayerSessionTokenRow, "created_at"> & {
  created_at?: string;
};

export type PlayerRow = {
  id: string;
  created_at: string;
  user_id: string;
  /**
   * What a room shows. Spaces, capitals and repeats all fine — two
   * people may both be "Zach", because `handle` is what tells them
   * apart. It was unique until handles arrived, and that was one column
   * doing two jobs.
   */
  display_name: string;
  /**
   * The name a player is FOUND by: lowercase, no spaces, unique.
   * Written as `@zach_b` wherever a person reads one.
   */
  handle: string;
  /** Public object URL in the `avatars` bucket, or null for the initials. */
  avatar_url: string | null;
  /**
   * An animated GIF avatar, shown only while the player is pro or
   * above. avatar_url keeps the still poster beside it, so a tier
   * change stops the motion rather than removing the picture.
   */
  avatar_animated: string | null;
  /** Cover banner object path in the same bucket, or null for none. */
  cover_image: string | null;
  /** Lifetime Embers. Public, monotonic, the badge. */
  embers_earned: number;
  /** Unspent Embers. Private, and the only number spending touches. */
  embers_balance: number;
  /**
   * Cosmetic slugs. Null means the free default for that slot.
   *
   * `equipped_frame` and `equipped_holo` are the DEFAULTS showcase cards
   * wear; a player_showcase row with its own slug overrides them for
   * that card. `equipped_avatar_frame` dresses the profile picture and
   * nothing else — the founder's split.
   */
  equipped_frame: string | null;
  equipped_holo: string | null;
  equipped_effect: string | null;
  equipped_avatar_frame: string | null;
  /**
   * Admin grant: owns every cosmetic, including ones added later.
   *
   * A flag rather than a pile of ownership rows, because "unlocked
   * forever" has to cover a catalogue that grows.
   */
  cosmetics_unlocked: boolean;
  /** Also owns the draft catalogue. Admin grant, founder only. */
  cosmetics_unlocked_draft: boolean;
  /** When setup finished. Null means a username was never chosen. */
  onboarded_at: string | null;
  /** Membership tier: free, pro, ultra or max. Admin-set for now. */
  tier: string;
  /**
   * Five digits, or null, and the fallback for "where is this player".
   *
   * A device coordinate is asked for first and never stored — it rides
   * one request and is gone. This is what a refusal falls back on, what
   * the website uses instead of a browser prompt, and what somebody who
   * would rather type than grant a permission gets to type.
   *
   * Coarse on purpose: it resolves to the centroid of an area that can
   * be miles across. It is not an address and there is nowhere here to
   * put one.
   */
  postal_code: string | null;
  /**
   * How far Local reaches from the player's origin, in miles.
   *
   * One of the offered steps (10, 25, 50, 100) — the database check
   * repeats the list in src/lib/local/shared.ts.
   */
  local_radius_miles: number;
};

/**
 * One conversation about one Flare — the Local tab's messaging.
 *
 * Accounts on both ends, resolved at open time, so the thread outlives
 * the 30-day session that posted the Flare. Closing is final: either
 * side can end it and an ended thread takes no more messages.
 */
export type FlareThreadRow = {
  id: string;
  created_at: string;
  flare_id: string;
  author_player_id: string;
  responder_player_id: string;
  last_message_at: string;
  closed_at: string | null;
  closed_by: string | null;
};

export type FlareThreadInsert = Omit<
  FlareThreadRow,
  "id" | "created_at" | "last_message_at" | "closed_at" | "closed_by"
> & {
  id?: string;
  created_at?: string;
  last_message_at?: string;
  closed_at?: string | null;
  closed_by?: string | null;
};

/** One message in a Flare thread. read_at is the other party's receipt. */
export type FlareMessageRow = {
  id: string;
  created_at: string;
  thread_id: string;
  sender_player_id: string;
  body: string;
  read_at: string | null;
};

export type FlareMessageInsert = Omit<
  FlareMessageRow,
  "id" | "created_at" | "read_at"
> & {
  id?: string;
  created_at?: string;
  read_at?: string | null;
};

export type PlayerInsert = Omit<
  PlayerRow,
  | "id"
  | "created_at"
  | "avatar_url"
  | "avatar_animated"
  | "cover_image"
  | "tier"
  | "embers_earned"
  | "embers_balance"
  | "equipped_frame"
  | "equipped_holo"
  | "equipped_effect"
  | "equipped_avatar_frame"
  | "cosmetics_unlocked"
  | "cosmetics_unlocked_draft"
  | "onboarded_at"
  | "postal_code"
  | "local_radius_miles"
> & {
  id?: string;
  created_at?: string;
  avatar_url?: string | null;
  avatar_animated?: string | null;
  cover_image?: string | null;
  embers_earned?: number;
  embers_balance?: number;
  equipped_frame?: string | null;
  equipped_holo?: string | null;
  equipped_effect?: string | null;
  equipped_avatar_frame?: string | null;
  postal_code?: string | null;
  local_radius_miles?: number;
  cosmetics_unlocked?: boolean;
  cosmetics_unlocked_draft?: boolean;
  onboarded_at?: string | null;
  tier?: string;
};

/**
 * One player following another. The founder's option C: one-way edges,
 * and a mutual pair reads as Trade partners. Rows are the count; no
 * count is exposed anywhere yet by design.
 */
/** One sealed or opened pack. Contents are never stored - drawn at opening. */
export type PlayerPackRow = {
  id: string;
  player_id: string;
  series: string;
  source: string;
  created_at: string;
  opened_at: string | null;
};

export type PlayerPackInsert = Omit<
  PlayerPackRow,
  "id" | "created_at" | "opened_at"
> & {
  id?: string;
  created_at?: string;
  opened_at?: string | null;
};

export type PlayerFollowRow = {
  follower_id: string;
  followed_id: string;
  created_at: string;
};

export type PlayerFollowInsert = Omit<PlayerFollowRow, "created_at"> & {
  created_at?: string;
};

/**
 * frame, holo and effect shipped first and equip through columns on
 * players; the other nine are the catalogue and equip through
 * player_equips. The list mirrors cosmetics_kind_check exactly.
 */
export type CosmeticKind =
  | "frame"
  | "holo"
  | "effect"
  | "ring"
  | "aura"
  | "border"
  | "pattern"
  | "animation"
  | "background"
  | "scene"
  | "nameplate"
  | "title"
  | "badge";

/** One worn slot per catalogue category. Absent row = nothing worn. */
export type PlayerEquipRow = {
  player_id: string;
  kind:
    | "ring"
    | "aura"
    | "border"
    | "pattern"
    | "animation"
    | "background"
    | "scene"
    | "nameplate"
    | "title"
    | "badge";
  cosmetic_slug: string;
  updated_at: string;
};

export type PlayerEquipInsert = Omit<PlayerEquipRow, "updated_at"> & {
  updated_at?: string;
};

export type PlayerGameRow = {
  player_id: string;
  game: "one-piece" | "riftbound" | "lorcana" | "mtg" | "pokemon";
  created_at: string;
};

export type PlayerGameInsert = Omit<PlayerGameRow, "created_at"> & {
  created_at?: string;
};

export type StoreClaimStatus = "unclaimed" | "pending" | "claimed";
export type StoreTier = "free" | "ultra";
export type StoreListingState = "draft" | "published";
export type StoreClaimState = "pending" | "approved" | "rejected" | "more-info";

/**
 * Where a store record came from, kept forever and shown to nobody.
 *
 * One row per provider record rather than columns on the store, so a shop
 * re-found in a later release gains a second row instead of overwriting
 * the first. `license` is per row because Overture Places is a MIX -
 * CDLA Permissive 2.0, Apache 2.0 and CC0 1.0 depending on the source of
 * the individual place - and the attribution that has to travel with a
 * record depends on which one it came from.
 */
type StoreSourceRow = {
  id: string;
  store_id: string;
  provider: string;
  provider_place_id: string;
  license: string | null;
  attribution: string | null;
  imported_at: string;
  imported_by: string | null;
  last_verified_at: string | null;
  last_synced_at: string | null;
};

type StoreSourceInsert = Omit<StoreSourceRow, "id" | "imported_at"> & {
  id?: string;
  imported_at?: string;
};

type StoreClaimRow = {
  id: string;
  created_at: string;
  store_id: string;
  claimant_name: string;
  claimant_email: string;
  claimant_role: string | null;
  business_email: string | null;
  notes: string | null;
  state: StoreClaimState;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
};

type StoreClaimInsert = Omit<
  StoreClaimRow,
  "id" | "created_at" | "state" | "reviewed_at" | "reviewed_by" | "review_note"
> & {
  id?: string;
  created_at?: string;
  state?: StoreClaimState;
};

/**
 * What an admin may change about a claim: the decision, and nothing else.
 *
 * A claimant writes the row once and never touches it again — the four
 * columns here are the review, and every one of them is set behind
 * `requireAdmin`. Insert deliberately cannot reach them, so a form post
 * cannot arrive pre-approved; this is the other half of that split, the
 * same shape `StoreUpdate` uses for `verified_at` and `tier`.
 */
type StoreClaimUpdate = {
  state?: StoreClaimState;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_note?: string | null;
};

type StoreCandidateRejectionRow = {
  provider: string;
  provider_place_id: string;
  rejected_at: string;
  rejected_by: string | null;
  reason: string | null;
};

type StoreCandidateRejectionInsert = Omit<StoreCandidateRejectionRow, "rejected_at"> & {
  rejected_at?: string;
};

type PackSeriesRow = {
  slug: string;
  name: string;
  set_number: number;
  description: string;
  price_embers: number;
  slots: number;
  /** Null means unscheduled; a future instant means "not on sale yet". */
  release_at: string | null;
  /** Storage object path for the wrapper art, or null for the default. */
  art_path: string | null;
  status: "live" | "draft";
  created_at: string;
};

export type PackSeriesInsert = Omit<
  PackSeriesRow,
  "created_at" | "description" | "price_embers" | "slots" | "status" | "art_path"
> & {
  created_at?: string;
  description?: string;
  price_embers?: number;
  slots?: number;
  status?: "live" | "draft";
  art_path?: string | null;
};

export type PackSeriesItemRow = {
  series_slug: string;
  cosmetic_slug: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  weight: number;
};

export type PackSeriesItemInsert = Omit<PackSeriesItemRow, "rarity" | "weight"> & {
  rarity?: PackSeriesItemRow["rarity"];
  weight?: number;
};

export type CosmeticRow = {
  /** live: real. draft: exists only in the admin console. */
  status: "live" | "draft";
  slug: string;
  kind: CosmeticKind;
  name: string;
  description: string;
  cost_embers: number;
  /** A lifetime-earned floor, or null for none. */
  requires_earned: number | null;
  sort_order: number;
  /**
   * How this cosmetic is drawn. 'css' is a .cfa- rule in
   * cosmetic-art.css; 'svg' is the drawing at svg_path; 'html' is the
   * markup at html_path, drawn in a frame with scripting off; 'rive'
   * is the file at rive_path, which nothing new arrives as any more.
   * The database refuses any kind without its own art, and any kind
   * carrying somebody else's.
   */
  art_kind: "css" | "rive" | "svg" | "html";
  /** Storage object path in the avatars bucket, for a Rive cosmetic. */
  rive_path: string | null;
  /**
   * The drawing behind an SVG cosmetic: a storage object, or a
   * /-prefixed path for art that ships in the repo.
   */
  svg_path: string | null;
  /**
   * The markup behind an HTML cosmetic: a storage object, or a
   * /-prefixed path for art that ships in the repo.
   */
  html_path: string | null;
  /** Which artboard to play, or null for the file's default. */
  rive_artboard: string | null;
  /** Which state machine to run, or null for the file's default. */
  rive_state_machine: string | null;
};

/**
 * Only PURCHASED cosmetics get a row. A zero-cost item is owned by
 * everybody with no row at all — see the migration's note; seeding free
 * items was the bug that left every new player with an empty wardrobe.
 */
export type PlayerCosmeticRow = {
  player_id: string;
  cosmetic_slug: string;
  acquired_at: string;
};

export type EmberReason = "trade" | "purchase" | "grant";

export type EmberLedgerRow = {
  id: string;
  created_at: string;
  player_id: string;
  reason: EmberReason;
  earned_delta: number;
  balance_delta: number;
  /** The idempotency key: 'trade:<id>', 'purchase:<player>:<slug>'. */
  ref: string;
  note: string | null;
};

export type PlayerShowcaseRow = {
  id: string;
  created_at: string;
  player_id: string;
  card_id: string;
  printing_id: string | null;
  position: number;
  /** This card's own dressing, or null to wear the profile's default. */
  frame_slug: string | null;
  holo_slug: string | null;
};

export type PlayerShowcaseInsert = Omit<
  PlayerShowcaseRow,
  "id" | "created_at" | "printing_id" | "position" | "frame_slug" | "holo_slug"
> & {
  id?: string;
  created_at?: string;
  printing_id?: string | null;
  position?: number;
  frame_slug?: string | null;
  holo_slug?: string | null;
};

export type PlayerInviteRow = {
  id: string;
  created_at: string;
  email: string;
  display_name: string;
  invited_by: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
};

export type PlayerInviteInsert = Omit<
  PlayerInviteRow,
  "id" | "created_at" | "accepted_at" | "accepted_by"
> & {
  id?: string;
  created_at?: string;
  accepted_at?: string | null;
  accepted_by?: string | null;
};

export type PlayerLocalRow = {
  id: string;
  created_at: string;
  player_id: string;
  store_id: string;
};

export type PlayerLocalInsert = Omit<PlayerLocalRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

/**
 * A notice from cardflare, shown on the Feed.
 *
 * The only authored thing on a screen that is otherwise entirely
 * derived, and not a player: it wears the mark, cannot be followed, and
 * has to say when it stops being true.
 */
export type AnnouncementRow = {
  id: string;
  created_at: string;
  created_by: string | null;
  headline: string;
  body: string;
  link_label: string | null;
  /** A path on our own origin, or null. Off-origin links are refused in SQL. */
  link_href: string | null;
  starts_at: string;
  /** Required, with no default: a notice with no end date is how a feed rots. */
  expires_at: string;
};

export type AnnouncementInsert = Omit<
  AnnouncementRow,
  "id" | "created_at" | "starts_at"
> & {
  id?: string;
  created_at?: string;
  starts_at?: string;
};

/**
 * One television in a shop, and the read-only token it authenticates
 * with. See supabase/migrations/20260922090000_event_hub.sql.
 */
export type EventHubDisplayRow = {
  id: string;
  created_at: string;
  updated_at: string;
  store_id: string;
  created_by: string | null;
  name: string;
  night_title: string | null;
  /** The read-only display identifier. Never leaves the server as a value. */
  token: string;
  layout: string;
  announcement: string | null;
  show_flares: boolean;
  show_qr: boolean;
  sound_enabled: boolean;
};

/** Everything the table defaults is optional here, and only `store_id` is not. */
export type EventHubDisplayInsert = Pick<EventHubDisplayRow, "store_id"> &
  Partial<Omit<EventHubDisplayRow, "store_id">>;

/**
 * One tournament on one display.
 *
 * No countdown value is stored — only what a person decided and when.
 * `src/lib/event-hub/timer.ts` does the arithmetic.
 */
export type EventHubTimerRow = {
  id: string;
  created_at: string;
  updated_at: string;
  display_id: string;
  position: number;
  game: string;
  event_name: string;
  round: number | null;
  format: string | null;
  bracket: string;
  preset_id: string;
  /** Null is a deliberate "untimed", not a missing value. */
  duration_seconds: number | null;
  status: string;
  started_at: string | null;
  paused_at: string | null;
  remaining_ms_when_paused: number | null;
  overtime_started_at: string | null;
  /** Null in overtime means the procedure counts turns, not seconds. */
  overtime_duration_seconds: number | null;
  overtime_turn: number;
  rules_dismissed: boolean;
};

export type EventHubTimerInsert = Pick<
  EventHubTimerRow,
  "display_id" | "game" | "event_name" | "preset_id"
> &
  Partial<Omit<EventHubTimerRow, "display_id" | "game" | "event_name" | "preset_id">>;

export type PlayerWantRow = {
  id: string;
  created_at: string;
  player_id: string;
  card_id: string;
  printing_id: string | null;
  quantity: number;
  note: string | null;
  /** The hunt this want belongs to, so it re-posts as a folder. */
  deck_label: string | null;
};

export type PlayerWantInsert = Omit<
  PlayerWantRow,
  "id" | "created_at" | "deck_label"
> & {
  id?: string;
  created_at?: string;
  deck_label?: string | null;
};

export type PlayerCollectionRow = {
  id: string;
  created_at: string;
  player_id: string;
  card_id: string;
  /** Null when the import could not prove which printing the copies are. */
  printing_id: string | null;
  quantity: number;
};

export type PlayerCollectionInsert = Omit<PlayerCollectionRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type NotificationRow = {
  id: string;
  created_at: string;
  player_id: string;
  kind:
    | "offer-received"
    | "trade-confirmed"
    | "early-board"
    | "board-open"
    | "new-follower"
    | "room-flare"
    | "message-received";
  title: string;
  body: string | null;
  /** A site-relative path (the room to open), never an absolute URL. */
  url: string | null;
  dedupe_key: string | null;
  read_at: string | null;
  emailed_at: string | null;
};

export type NotificationInsert = Omit<
  NotificationRow,
  "id" | "created_at" | "body" | "url" | "dedupe_key" | "read_at" | "emailed_at"
> & {
  id?: string;
  created_at?: string;
  body?: string | null;
  url?: string | null;
  dedupe_key?: string | null;
  read_at?: string | null;
  emailed_at?: string | null;
};

export type PlayerDeviceRow = {
  id: string;
  created_at: string;
  player_id: string;
  platform: "ios" | "android" | "web";
  push_token: string;
  last_seen_at: string;
};

export type PlayerDeviceInsert = Omit<
  PlayerDeviceRow,
  "id" | "created_at" | "last_seen_at"
> & { id?: string; created_at?: string; last_seen_at?: string };

export type PlayerCollectionSyncRow = {
  player_id: string;
  synced_at: string;
  lines_seen: number;
  cards_matched: number;
  lines_unmatched: number;
};

export type PlayerCollectionSyncInsert = Omit<PlayerCollectionSyncRow, "synced_at"> & {
  synced_at?: string;
};

export type PlayerSessionInsert = Omit<
  PlayerSessionRow,
  "id" | "created_at" | "last_seen_at" | "player_id"
> & {
  id?: string;
  created_at?: string;
  last_seen_at?: string;
  player_id?: string | null;
};

export type AdminUserRow = {
  user_id: string;
  created_at: string;
  note: string | null;
};

/**
 * `Update` defaults to a partial insert, and stores override it.
 *
 * Verification must be unreachable from a CREATE - nothing that makes a
 * store may decide it is verified - which is why `StoreInsert` types
 * those columns as `never`. But an admin action has to be able to set
 * them, and a partial of that insert cannot. So the update shape is its
 * own parameter: the ban stays where it belongs, on creation, instead of
 * being loosened everywhere to unblock one screen.
 */
type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type SubscriptionRow = {
  id: string;
  created_at: string;
  updated_at: string;
  tier: "pro" | "ultra" | "max";
  player_id: string | null;
  store_id: string | null;
  source: "stripe" | "apple";
  status: "active" | "trialing" | "past_due" | "canceled";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  apple_original_transaction_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type SubscriptionInsert = Omit<
  SubscriptionRow,
  | "id"
  | "created_at"
  | "updated_at"
  | "player_id"
  | "store_id"
  | "stripe_customer_id"
  | "stripe_subscription_id"
  | "apple_original_transaction_id"
  | "current_period_end"
  | "cancel_at_period_end"
> & {
  id?: string;
  player_id?: string | null;
  store_id?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  apple_original_transaction_id?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  updated_at?: string;
};

export type Database = {
  public: {
    Tables: {
      waitlist_signups: Table<WaitlistSignupRow, WaitlistSignupInsert>;
      stores: Table<StoreRow, StoreInsert, StoreUpdate>;
      store_members: Table<StoreMemberRow, StoreMemberInsert>;
      store_invites: Table<StoreInviteRow, StoreInviteInsert>;
      admin_users: Table<AdminUserRow, Partial<AdminUserRow>>;
      player_sessions: Table<PlayerSessionRow, PlayerSessionInsert>;
      flare_threads: Table<FlareThreadRow, FlareThreadInsert>;
      flare_messages: Table<FlareMessageRow, FlareMessageInsert>;
      player_session_tokens: Table<PlayerSessionTokenRow, PlayerSessionTokenInsert>;
      events: Table<EventRow, EventInsert>;
      event_participants: Table<EventParticipantRow, EventParticipantInsert>;
      flares: Table<FlareRow, FlareInsert>;
      flare_responses: Table<FlareResponseRow, FlareResponseInsert>;
      trades: Table<TradeRow, TradeInsert>;
      shows: Table<ShowRow, ShowInsert>;
      show_vendors: Table<ShowVendorRow, ShowVendorInsert>;
      vendor_inventory: Table<VendorInventoryRow, VendorInventoryInsert>;
      store_singles: Table<StoreSingleRow, StoreSingleInsert>;
      store_singles_syncs: Table<StoreSinglesSyncRow, StoreSinglesSyncInsert>;
      players: Table<PlayerRow, PlayerInsert>;
      player_follows: Table<PlayerFollowRow, PlayerFollowInsert>;
      player_packs: Table<PlayerPackRow, PlayerPackInsert>;
      cosmetics: Table<CosmeticRow, CosmeticRow>;
      player_equips: Table<PlayerEquipRow, PlayerEquipInsert>;
      pack_series: Table<PackSeriesRow, PackSeriesInsert>;
      store_sources: Table<StoreSourceRow, StoreSourceInsert>;
      store_claims: Table<StoreClaimRow, StoreClaimInsert, StoreClaimUpdate>;
      store_candidate_rejections: Table<
        StoreCandidateRejectionRow,
        StoreCandidateRejectionInsert
      >;
      player_games: Table<PlayerGameRow, PlayerGameInsert>;
      pack_series_items: Table<PackSeriesItemRow, PackSeriesItemInsert>;
      player_cosmetics: Table<
        PlayerCosmeticRow,
        Omit<PlayerCosmeticRow, "acquired_at"> & { acquired_at?: string }
      >;
      ember_ledger: Table<EmberLedgerRow, EmberLedgerRow>;
      player_showcase: Table<PlayerShowcaseRow, PlayerShowcaseInsert>;
      player_invites: Table<PlayerInviteRow, PlayerInviteInsert>;
      player_wants: Table<PlayerWantRow, PlayerWantInsert>;
      player_locals: Table<PlayerLocalRow, PlayerLocalInsert>;
      announcements: Table<AnnouncementRow, AnnouncementInsert>;
      event_hub_displays: Table<EventHubDisplayRow, EventHubDisplayInsert>;
      event_hub_timers: Table<EventHubTimerRow, EventHubTimerInsert>;
      notifications: Table<NotificationRow, NotificationInsert>;
      subscriptions: Table<SubscriptionRow, SubscriptionInsert>;
      player_devices: Table<PlayerDeviceRow, PlayerDeviceInsert>;
      player_collection: Table<PlayerCollectionRow, PlayerCollectionInsert>;
      player_collection_syncs: Table<
        PlayerCollectionSyncRow,
        PlayerCollectionSyncInsert
      >;
      player_cards: Table<PlayerCardRow, PlayerCardInsert>;
      cards: Table<CardRow, CardInsert>;
      card_printings: Table<CardPrintingRow, CardPrintingInsert>;
      card_aliases: Table<CardAliasRow, CardAliasInsert>;
      card_sync_runs: Table<CardSyncRunRow, CardSyncRunInsert>;
      card_sync_failures: Table<CardSyncFailureRow, CardSyncFailureInsert>;
    };
    Views: Record<string, never>;
    Functions: {
      search_cards: {
        Args: {
          search_query: string;
          result_limit?: number;
          filter_set_code?: string | null;
          filter_card_type?: string | null;
          filter_color?: string | null;
        };
        Returns: CardSearchRow[];
      };
      /* Folds one player session into another — binder, Flares, offers,
         memberships and trades — collapsing duplicates rather than failing
         on them. The source's token survives as an alias, so the device
         holding it is not signed out. */
      merge_player_sessions: {
        Args: { source: string; target: string };
        Returns: undefined;
      };
      /* Both return false rather than raising when the movement is
         refused — a repeated ref, or a balance that cannot cover it. */
      award_embers: {
        Args: {
          target_player: string;
          amount: number;
          award_reason: EmberReason;
          award_ref: string;
          award_note?: string | null;
        };
        Returns: boolean;
      };
      /* Balance only, never the badge: an admin gift is not a trade. */
      grant_embers: {
        Args: {
          target_player: string;
          amount: number;
          grant_ref: string;
          grant_note?: string | null;
        };
        Returns: boolean;
      };
      spend_embers: {
        Args: {
          target_player: string;
          cost: number;
          spend_ref: string;
          spend_note?: string | null;
        };
        Returns: boolean;
      };
    };
    Enums: {
      waitlist_user_type: UserType;
      waitlist_status: WaitlistStatus;
      store_status: StoreStatus;
      store_role: StoreRole;
      event_status: EventStatus;
      flare_status: FlareStatus;
      game: Game;
      sync_status: SyncStatus;
      sync_mode: SyncMode;
    };
    CompositeTypes: Record<string, never>;
  };
};
