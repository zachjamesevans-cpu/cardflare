import { tierAllows } from "@/lib/tiers";

/**
 * The avatar frame a player row may SHOW, wherever a face is drawn.
 *
 * Wearing is a Pro capability, and `equipped_avatar_frame` keeps a
 * lapsed (or never-Pro) player's old pick underneath. Every list that
 * draws a face - search, follows, the feed, the inbox, rooms - reads
 * the column through this, so the frame comes off everywhere the
 * moment the tier drops, the same way getEquips takes a ring off. Null
 * draws the free frame, which every tier may show.
 */
export function wornFrame(row: {
  tier: string | null;
  equipped_avatar_frame: string | null;
}): string | null {
  return tierAllows(row.tier, "cosmetics") ? row.equipped_avatar_frame : null;
}
