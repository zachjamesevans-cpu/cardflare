import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * One conversation per pair of people.
 *
 * The founder (2026-10-04), with Instagram's Messages open: "Conversation
 * should be person." A pair's conversation is its direct thread (no
 * Flare, no want), unique per pair by `flare_threads_direct_unique_idx`.
 * A thread on a Flare or a saved want still exists as an ANCHOR, so
 * "already talking about this card" keeps its answer, but it holds no
 * messages: every message lands in the pair's conversation, and a
 * message that opened an offer carries the card it was about.
 */

/** The pair's conversation, found or made. `approached` sits in the author's chair. */
export async function pairThreadId(
  approached: string,
  opener: string,
): Promise<string | null> {
  if (approached === opener) return null;
  const admin = getSupabaseAdmin();

  const find = () =>
    admin
      .from("flare_threads")
      .select("id")
      .is("flare_id", null)
      .is("want_id", null)
      .or(
        `and(author_player_id.eq.${approached},responder_player_id.eq.${opener}),and(author_player_id.eq.${opener},responder_player_id.eq.${approached})`,
      )
      .maybeSingle();

  const { data: existing } = await find();
  if (existing) return existing.id;

  const { data: made, error } = await admin
    .from("flare_threads")
    .insert({ author_player_id: approached, responder_player_id: opener })
    .select("id")
    .maybeSingle();

  if (error && error.code === "23505") {
    /* Two opens raced; the other insert won. */
    const { data: raced } = await find();
    return raced?.id ?? null;
  }
  if (error) console.error("Could not open the pair's conversation", error);
  return made?.id ?? null;
}

/**
 * The conversation any thread id belongs to: itself for a direct thread,
 * the pair's conversation for an anchor on a Flare or a want. Old
 * notification links and old builds hold anchor ids; this is what makes
 * them open the person's chat.
 */
export async function conversationIdFor(threadId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("flare_threads")
    .select("id, flare_id, want_id, author_player_id, responder_player_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!data) return null;
  if (!data.flare_id && !data.want_id) return data.id;
  return pairThreadId(data.author_player_id, data.responder_player_id);
}
