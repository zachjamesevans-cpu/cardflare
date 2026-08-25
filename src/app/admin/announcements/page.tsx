import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AnnouncementForm } from "@/components/admin/announcement-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card } from "@/components/ui/card";
import { endAnnouncementAction } from "@/lib/announcements/actions";
import { listAnnouncements } from "@/lib/announcements/repository";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Announcements",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Notices from cardflare, and the form that writes the next one.
 *
 * The only surface in the product where an operator's words reach every
 * player. It is deliberately small: one notice shows at a time, every
 * one carries an expiry, and nothing here can be a player.
 */
export default async function AdminAnnouncementsPage() {
  // The layout guards too. Duplicated deliberately: a layout is not a
  // security boundary on its own.
  await requireAdmin();

  const announcements = await listAnnouncements();
  /* Whether a notice is showing is decided in the repository — a render
     may not read the clock. */
  const showing = announcements.filter((notice) => notice.showing);
  const over = announcements.filter((notice) => !notice.showing);

  const when = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Link
          href="/admin"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to the console
        </Link>

        <h2 className="text-xl font-bold text-text-primary">Announcements</h2>
        <p className="max-w-2xl text-sm text-text-secondary">
          A notice from cardflare, at the top of every player&rsquo;s Feed. It wears the
          mark rather than a face &mdash; there is no cardflare account and nobody can
          follow it &mdash; and it leaves on its own when it expires. The newest one
          showing is the one they see.
        </p>
      </div>

      <section className="flex flex-col gap-5" aria-labelledby="write-heading">
        <h3 id="write-heading" className="text-lg font-bold text-text-primary">
          Write one
        </h3>

        <Card>
          <AnnouncementForm />
        </Card>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="showing-heading">
        <h3 id="showing-heading" className="text-lg font-bold text-text-primary">
          Showing now
        </h3>

        {showing.length === 0 ? (
          <Card>
            <p className="text-sm text-text-secondary">
              Nothing is showing. The Feed is entirely derived until you write
              something.
            </p>
          </Card>
        ) : (
          showing.map((notice) => (
            <Card key={notice.id} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-text-primary">{notice.headline}</p>
                <p className="text-sm text-text-secondary">{notice.body}</p>
              </div>

              <p className="text-xs text-text-muted">
                {notice.linkLabel ? `${notice.linkLabel} → ${notice.linkHref} · ` : ""}
                Until {when.format(new Date(notice.expiresAt))}
              </p>

              {/* Ends it rather than deleting it: what was said and when
                  is the sort of thing somebody asks about a fortnight
                  later, and the Feed cannot tell the difference. */}
              <form action={endAnnouncementAction}>
                <input type="hidden" name="id" value={notice.id} />
                <SubmitButton
                  variant="secondary"
                  size="sm"
                  label="Take it down"
                  pendingLabel="Taking it down…"
                />
              </form>
            </Card>
          ))
        )}
      </section>

      {over.length > 0 && (
        <section className="flex flex-col gap-5" aria-labelledby="past-heading">
          <h3 id="past-heading" className="text-lg font-bold text-text-primary">
            Finished
          </h3>

          <Card>
            <ul className="flex flex-col">
              {over.map((notice) => (
                <li
                  key={notice.id}
                  className="flex flex-col gap-0.5 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <span className="text-sm font-semibold text-text-primary">
                    {notice.headline}
                  </span>
                  <span className="text-xs text-text-muted">
                    Ended {when.format(new Date(notice.expiresAt))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}
