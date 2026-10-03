import "server-only";

import { ALL_ON, type PushGroup, type PushPrefs } from "@/lib/notifications/push-prefs";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/** The account's four switches. A read that fails reads as all on, the default. */
export async function pushPrefsFor(playerId: string): Promise<PushPrefs> {
  if (!isSupabaseConfigured()) return ALL_ON;
  const { data, error } = await getSupabaseAdmin()
    .from("players")
    .select("push_offers, push_messages, push_nights, push_social")
    .eq("id", playerId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("Could not read the push switches", error);
    return ALL_ON;
  }
  return {
    offers: data.push_offers ?? true,
    messages: data.push_messages ?? true,
    nights: data.push_nights ?? true,
    social: data.push_social ?? true,
  };
}

export async function setPushPref(
  playerId: string,
  group: PushGroup,
  on: boolean,
): Promise<PushPrefs> {
  if (!isSupabaseConfigured()) return ALL_ON;
  const patch =
    group === "offers"
      ? { push_offers: on }
      : group === "messages"
        ? { push_messages: on }
        : group === "nights"
          ? { push_nights: on }
          : { push_social: on };
  const { error } = await getSupabaseAdmin()
    .from("players")
    .update(patch)
    .eq("id", playerId);
  if (error) console.error("Could not set a push switch", error);
  return pushPrefsFor(playerId);
}
