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
  contact_email: string;
  city: string | null;
  region: string | null;
  status: StoreStatus;
  is_pilot: boolean;
};

/** Columns with database defaults are optional on insert. */
export type StoreInsert = Omit<
  StoreRow,
  "id" | "created_at" | "status" | "is_pilot"
> & {
  id?: string;
  created_at?: string;
  status?: StoreStatus;
  is_pilot?: boolean;
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

export type EventStatus = "draft" | "open" | "closed";
export type Game = "one_piece";

export type EventRow = {
  id: string;
  created_at: string;
  store_id: string;
  created_by: string | null;
  name: string;
  game: Game;
  starts_at: string;
  ends_at: string;
  status: EventStatus;
  join_code: string;
};

export type EventInsert = Omit<EventRow, "id" | "created_at" | "status" | "game"> & {
  id?: string;
  created_at?: string;
  status?: EventStatus;
  game?: Game;
};

export type EventParticipantRow = {
  id: string;
  event_id: string;
  player_session_id: string;
  joined_at: string;
  last_seen_at: string;
};

export type EventParticipantInsert = Omit<
  EventParticipantRow,
  "id" | "joined_at" | "last_seen_at"
> & {
  id?: string;
  joined_at?: string;
  last_seen_at?: string;
};

export type FlareStatus = "open" | "cancelled";

/** A live request for a card, in one Event Room. Public to that room. */
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
};

export type FlareInsert = Omit<
  FlareRow,
  "id" | "created_at" | "updated_at" | "status" | "quantity"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  status?: FlareStatus;
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
};

export type PlayerSessionInsert = Omit<
  PlayerSessionRow,
  "id" | "created_at" | "last_seen_at"
> & {
  id?: string;
  created_at?: string;
  last_seen_at?: string;
};

export type AdminUserRow = {
  user_id: string;
  created_at: string;
  note: string | null;
};

type Table<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      waitlist_signups: Table<WaitlistSignupRow, WaitlistSignupInsert>;
      stores: Table<StoreRow, StoreInsert>;
      store_members: Table<StoreMemberRow, StoreMemberInsert>;
      store_invites: Table<StoreInviteRow, StoreInviteInsert>;
      admin_users: Table<AdminUserRow, Partial<AdminUserRow>>;
      player_sessions: Table<PlayerSessionRow, PlayerSessionInsert>;
      events: Table<EventRow, EventInsert>;
      event_participants: Table<EventParticipantRow, EventParticipantInsert>;
      flares: Table<FlareRow, FlareInsert>;
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
