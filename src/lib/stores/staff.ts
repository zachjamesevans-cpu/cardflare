import "server-only";

import type { StoreRole } from "@/lib/supabase/types";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { avatarPathFor, avatarSrc } from "@/lib/players/profile-image";

/**
 * Who runs a store, and as what.
 *
 * `store_members.role` is "owner" or "staff". An OWNER is the store
 * account: billing, singles, settings, everything. A "staff" row is an
 * ORGANIZER (the "TO" badge, tournament organizer): a player the owner
 * named, who may run FlareCast, the timers and the remote from their
 * phone and nothing about money, membership or the case. The word
 * "staff" never reaches a screen; every surface says Organizer.
 *
 * Everything here goes through the service role after the Server
 * Action has established who is asking, the same pattern every other
 * table follows.
 */

export interface StaffMember {
  userId: string;
  role: StoreRole;
  /** Null for a store login with no player behind it (an owner, usually). */
  playerId: string | null;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
}

/** Everybody on the store, owners first, then organizers, oldest first. */
export async function listStaff(storeId: string): Promise<StaffMember[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();

  const { data: members, error } = await admin
    .from("store_members")
    .select("user_id, role, created_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Could not read the store's members", error);
    return [];
  }

  const rows = members ?? [];
  if (rows.length === 0) return [];

  const { data: players, error: playerError } = await admin
    .from("players")
    .select("id, user_id, display_name, handle, avatar_url, avatar_animated, tier")
    .in(
      "user_id",
      rows.map((row) => row.user_id),
    );

  if (playerError) {
    console.error("Could not read the players behind the store's members", playerError);
  }

  const byUser = new Map((players ?? []).map((player) => [player.user_id, player]));

  const weight = (role: StoreRole) => (role === "owner" ? 0 : 1);

  return rows
    .map((row) => {
      const player = byUser.get(row.user_id) ?? null;
      return {
        userId: row.user_id,
        role: row.role,
        playerId: player?.id ?? null,
        displayName:
          player?.display_name ?? (row.role === "owner" ? "Owner" : "Organizer"),
        handle: player?.handle ?? null,
        avatarUrl: player ? avatarSrc(avatarPathFor(player)) : null,
      };
    })
    .sort((a, b) => weight(a.role) - weight(b.role));
}

export type StaffOutcome = { ok: true } | { ok: false; message: string };

/**
 * Names a player an organizer. Refused when they already belong to the
 * store in any role: an owner must not be quietly demoted to staff by
 * being "added" a second time.
 */
export async function addOrganizer(
  storeId: string,
  playerId: string,
): Promise<StaffOutcome> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "The database isn't configured." };
  }

  const admin = getSupabaseAdmin();

  const { data: player, error: playerError } = await admin
    .from("players")
    .select("id, user_id")
    .eq("id", playerId)
    .maybeSingle();

  if (playerError || !player) {
    return { ok: false, message: "No such player." };
  }

  const { data: existing } = await admin
    .from("store_members")
    .select("role")
    .eq("store_id", storeId)
    .eq("user_id", player.user_id)
    .maybeSingle();

  if (existing) {
    return {
      ok: false,
      message:
        existing.role === "owner"
          ? "That player already owns this store."
          : "That player is already an organizer here.",
    };
  }

  const { error } = await admin
    .from("store_members")
    .insert({ store_id: storeId, user_id: player.user_id, role: "staff" });

  if (error) {
    console.error("Could not add the organizer", error);
    return { ok: false, message: "That didn't save. Try again in a moment." };
  }

  return { ok: true };
}

/**
 * Takes the organizer badge back. Scoped to role "staff" so this can
 * never delete an owner row, whatever user id the form carried.
 */
export async function removeOrganizer(
  storeId: string,
  userId: string,
): Promise<StaffOutcome> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "The database isn't configured." };
  }

  const { error } = await getSupabaseAdmin()
    .from("store_members")
    .delete()
    .eq("store_id", storeId)
    .eq("user_id", userId)
    .eq("role", "staff");

  if (error) {
    console.error("Could not remove the organizer", error);
    return { ok: false, message: "That didn't save. Try again in a moment." };
  }

  return { ok: true };
}

/** A store a player organizes at, for the TO badge. */
export interface OrganizerStore {
  storeId: string;
  name: string;
}

/**
 * The stores that named this player an organizer. Empty for nearly
 * everybody. Owners are deliberately not included: the badge says
 * "runs tournaments here", which is what an organizer is and what an
 * owner's store account, with no player row, never shows.
 */
export async function organizerStoresFor(playerId: string): Promise<OrganizerStore[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();

  const { data: player } = await admin
    .from("players")
    .select("user_id")
    .eq("id", playerId)
    .maybeSingle();

  if (!player) return [];

  const { data: memberships, error } = await admin
    .from("store_members")
    .select("store_id")
    .eq("user_id", player.user_id)
    .eq("role", "staff");

  if (error) {
    console.error("Could not read the player's organizer stores", error);
    return [];
  }

  const storeIds = (memberships ?? []).map((row) => row.store_id);
  if (storeIds.length === 0) return [];

  const { data: stores, error: storeError } = await admin
    .from("stores")
    .select("id, name")
    .in("id", storeIds)
    .order("name");

  if (storeError) {
    console.error("Could not read the stores a player organizes at", storeError);
    return [];
  }

  return (stores ?? []).map((store) => ({ storeId: store.id, name: store.name }));
}
