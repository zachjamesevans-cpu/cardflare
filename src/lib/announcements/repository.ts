import "server-only";

import type { AnnouncementRow } from "@/lib/supabase/types";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Notices from cardflare.
 *
 * The one authored thing on the Feed. Everything else there is derived
 * — a board is open or it is not, a friend posted or they did not — and
 * that is what keeps it honest, but it also means a brand-new player on
 * a quiet Tuesday opens nothing at all. A release week has something to
 * say, and this is the only way to say it.
 *
 * Not a player account, which was the other way to build it: a cardflare
 * row in `players` would be followable, unfollowable, and a face on a
 * screen where every other face belongs to somebody who stood in a shop.
 * See the migration for the full argument.
 */

export interface Announcement {
  id: string;
  headline: string;
  body: string;
  linkLabel: string | null;
  /** A path on our own origin. The database refuses anything else. */
  linkHref: string | null;
  startsAt: string;
  expiresAt: string;
  /**
   * Whether a player is reading this right now.
   *
   * Worked out here rather than by whoever renders the list: a Server
   * Component may not read the clock — a render has to be pure, and
   * eslint enforces it — so "is it showing" is a fact the repository
   * hands over, like every other fact on the row.
   */
  showing: boolean;
}

/** How many show at once. More than one is a newsletter, not a notice. */
const SHOWING = 1;

function fromRow(row: AnnouncementRow, now: number): Announcement {
  return {
    id: row.id,
    headline: row.headline,
    body: row.body,
    linkLabel: row.link_label,
    linkHref: row.link_href,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    showing: Date.parse(row.starts_at) <= now && Date.parse(row.expires_at) > now,
  };
}

/**
 * What is showing right now: started, not yet expired, newest first.
 *
 * Never throws. The Feed is the screen a player opens by habit, and a
 * notice failing to load is not a reason to show them an error where
 * their friends' hunts should be.
 */
export async function showingAnnouncements(): Promise<Announcement[]> {
  if (!isSupabaseConfigured()) return [];

  const now = Date.now();
  const stamp = new Date(now).toISOString();

  const { data, error } = await getSupabaseAdmin()
    .from("announcements")
    .select("*")
    .lte("starts_at", stamp)
    .gt("expires_at", stamp)
    .order("starts_at", { ascending: false })
    .limit(SHOWING);

  if (error) {
    console.error("Could not read the announcements", error);
    return [];
  }

  return (data ?? []).map((row) => fromRow(row, now));
}

/** Every notice, live and expired, newest first. The console's list. */
export async function listAnnouncements(): Promise<Announcement[]> {
  if (!isSupabaseConfigured()) return [];

  const now = Date.now();

  const { data, error } = await getSupabaseAdmin()
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Could not list the announcements", error);
    return [];
  }

  return (data ?? []).map((row) => fromRow(row, now));
}

export async function createAnnouncement(input: {
  headline: string;
  body: string;
  linkLabel: string | null;
  linkHref: string | null;
  expiresAt: string;
  createdBy: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "The database isn't configured." };
  }

  const { error } = await getSupabaseAdmin().from("announcements").insert({
    headline: input.headline,
    body: input.body,
    link_label: input.linkLabel,
    link_href: input.linkHref,
    expires_at: input.expiresAt,
    created_by: input.createdBy,
  });

  if (error) {
    console.error("Could not write the announcement", error);
    return { ok: false, message: "That didn't save. Check the fields and try again." };
  }

  return { ok: true };
}

/**
 * Ends a notice now, rather than deleting it.
 *
 * Deleting would lose what was said and when, which is the sort of thing
 * somebody asks about a fortnight later. Expiring it is the same effect
 * on the Feed and keeps the record.
 */
export async function endAnnouncement(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  /* A second apart, because the table insists a notice ends after it
     begins — and a notice scheduled for next week has to be pulled back
     as well as cut short, or it would still be waiting to appear. */
  const now = Date.now();

  const { error } = await getSupabaseAdmin()
    .from("announcements")
    .update({
      starts_at: new Date(now - 1000).toISOString(),
      expires_at: new Date(now).toISOString(),
    })
    .eq("id", id);

  if (error) console.error("Could not end the announcement", error);
}
