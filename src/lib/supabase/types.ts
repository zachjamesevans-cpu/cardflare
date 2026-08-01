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

export type CardCategory = "leader" | "character" | "event" | "stage" | "don";

export type CardRow = {
  id: string;
  created_at: string;
  updated_at: string;
  game: Game;
  code: string;
  name: string;
  category: CardCategory;
  colors: string[];
  types: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  attribute: string | null;
};

export type CardInsert = Omit<CardRow, "id" | "created_at" | "game"> & {
  id?: string;
  created_at?: string;
  game?: Game;
};

export type CardPrintingRow = {
  id: string;
  card_id: string;
  set_code: string;
  rarity: string | null;
  variant: string | null;
  /** Null unless a provider is licensed to supply artwork. */
  image_url: string | null;
};

export type CardPrintingInsert = Omit<CardPrintingRow, "id"> & { id?: string };

export type CardAliasRow = { id: string; card_id: string; alias: string };
export type CardAliasInsert = Omit<CardAliasRow, "id"> & { id?: string };

/** One row of `search_cards`: a card plus its relevance score. */
export type CardSearchRow = Omit<CardRow, "created_at" | "updated_at" | "game"> & {
  score: number;
};

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
      cards: Table<CardRow, CardInsert>;
      card_printings: Table<CardPrintingRow, CardPrintingInsert>;
      card_aliases: Table<CardAliasRow, CardAliasInsert>;
    };
    Views: Record<string, never>;
    Functions: {
      search_cards: {
        Args: { search_query: string; result_limit?: number };
        Returns: CardSearchRow[];
      };
    };
    Enums: {
      waitlist_user_type: UserType;
      waitlist_status: WaitlistStatus;
      store_status: StoreStatus;
      store_role: StoreRole;
      event_status: EventStatus;
      game: Game;
      card_category: CardCategory;
    };
    CompositeTypes: Record<string, never>;
  };
};
