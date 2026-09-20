import type { Metadata } from "next";
import { Heart, MessageCircle } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { StorePostComposer } from "@/components/stores/store-post-composer";
import { StoreTabs } from "@/components/stores/store-tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listEventsForStore } from "@/lib/events/repository";
import { loadStoreConsole } from "@/lib/stores/console";
import { archiveStorePostAction } from "@/lib/stores/post-actions";
import { upcomingEventChoices } from "@/lib/stores/post-schema";
import { listStorePosts } from "@/lib/stores/posts";

export const metadata: Metadata = {
  title: "Posts",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** "Sat, Oct 4, 12:00 PM" in the store's own clock, for the event picker. */
function eventChoiceLabel(name: string, startsAt: string, timeZone: string): string {
  const when = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(startsAt));
  return `${name} · ${when}`;
}

function postedLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/**
 * The Posts tab: what the store tells its followers.
 *
 * Owners and organizers both. The founder: "a store announcing 'OP-12
 * prerelease Saturday, 20 seats' as a Flare-shaped post to its
 * followers. This is the thing that makes following worth it." The
 * compose card first, then everything published, each with its heart
 * and comment counts and a way to take it down.
 */
export default async function StorePostsPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;
  const { viewer, store, areas, currentArea } = await loadStoreConsole(
    as,
    "/store/posts",
  );
  if (!store || store.kind === "vendor") return null;

  const timeZone = store.timezone ?? "UTC";
  const [events, posts] = await Promise.all([
    listEventsForStore(store.id),
    listStorePosts(store.id),
  ]);
  const choices = upcomingEventChoices(events).map((event) => ({
    id: event.id,
    label: eventChoiceLabel(event.name, event.starts_at, timeZone),
  }));

  return (
    <AppShell
      area="Store"
      email={viewer.user.email ?? ""}
      title="Posts"
      description="What you tell the players who follow you. It lands in their Feed, with a heart and a thread under it."
      areas={areas}
      currentArea={currentArea}
    >
      <StoreTabs storeId={store.id} />

      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-text-primary">New post</h2>
          <p className="text-sm text-text-secondary">
            A prerelease, a restock, a change of hours. Pick the event night it is about
            and followers get an &ldquo;I&rsquo;ll be there&rdquo; button.
          </p>
        </div>
        <StorePostComposer storeId={store.id} events={choices} />
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-text-primary">Published</h2>
          <p className="text-sm text-text-secondary">
            {posts.length === 0
              ? "Nothing yet. Your first post goes to everyone who follows the store."
              : "Newest first. Taking one down removes it from every Feed."}
          </p>
        </div>

        {posts.length > 0 && (
          <ul className="flex flex-col">
            {posts.map((post) => (
              <li
                key={post.id}
                className="flex flex-col gap-3 border-t border-border py-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-start"
              >
                {post.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.imageUrl}
                    alt=""
                    className="aspect-video w-full shrink-0 rounded-[10px] border border-border object-cover sm:w-40"
                    loading="lazy"
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="font-semibold text-text-primary">{post.title}</p>
                  {post.body && (
                    <p className="line-clamp-3 text-sm whitespace-pre-line text-text-secondary">
                      {post.body}
                    </p>
                  )}
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                    <span>{postedLabel(post.publishedAt, timeZone)}</span>
                    {post.eventName && <span>About {post.eventName}</span>}
                    <span className="flex items-center gap-1 tabular-nums">
                      <Heart className="size-3.5" aria-hidden="true" />
                      {post.likes}
                    </span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <MessageCircle className="size-3.5" aria-hidden="true" />
                      {post.comments}
                    </span>
                  </p>
                </div>
                <form action={archiveStorePostAction.bind(null, store.id, post.id)}>
                  <Button type="submit" size="sm" variant="ghost">
                    Take down
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
