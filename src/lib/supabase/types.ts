/**
 * Hand-maintained mirror of the SQL in supabase/migrations.
 *
 * Regenerate with the Supabase CLI once the project exists:
 *   npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts
 *
 * These must be `type` aliases rather than `interface`s: supabase-js constrains
 * the schema to `Record<string, ...>`, and only type aliases receive an implicit
 * index signature. Using an interface makes the schema silently resolve to
 * `never` and every query lose its types.
 */
import type { UserType } from "@/lib/waitlist/schema";

export type WaitlistStatus = "active" | "unsubscribed" | "bounced";

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

export type Database = {
  public: {
    Tables: {
      waitlist_signups: {
        Row: WaitlistSignupRow;
        Insert: WaitlistSignupInsert;
        Update: Partial<WaitlistSignupInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      waitlist_user_type: UserType;
      waitlist_status: WaitlistStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
