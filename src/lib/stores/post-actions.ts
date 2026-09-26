"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { storeHasFeature } from "@/lib/stores/ultra-access";
import { text } from "@/lib/form-value";
import { notifyStorePost } from "@/lib/notifications/notify";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  STORE_IMAGE_MAX_BYTES,
  STORE_IMAGE_MIME_TYPES,
} from "@/lib/stores/store-image";
import { STORE_POST_RATE, storePostSchema, type StorePostState } from "./post-schema";
import { archiveStorePost, createStorePost } from "./posts";

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

/**
 * Who may post as a store: its OWNER, an ORGANIZER the owner named,
 * and an admin. An organizer runs the nights, and "OP-12 prerelease
 * Saturday, 20 seats" is exactly the news they have. The role is read
 * from the viewer's own memberships, which `getViewer` loads with the
 * service role, so a store id posted by anyone else goes nowhere.
 */
async function authorizedPoster(storeId: string): Promise<string | null> {
  if (!storeId) return null;
  const viewer = await getViewer();
  const allowed =
    viewer.kind === "admin" ||
    (viewer.kind === "store" && viewer.storeRoles[storeId] !== undefined) ||
    (viewer.kind === "player" && viewer.organizerStoreIds.includes(storeId));
  if (!allowed) {
    console.error("Rejected a store post from an unauthorised viewer.");
    return null;
  }
  /* Posts to followers are Ultra's. */
  if (!(await storeHasFeature(storeId, "storePosts"))) return null;
  return viewer.user.id;
}

/** The post is read on the console, the Feed and the store's page. */
function revalidatePosts(storeId: string): void {
  revalidatePath("/store/posts");
  revalidatePath("/feed");
  revalidatePath(`/s/${storeId}`);
}

/**
 * Publish a post from the console.
 *
 * A Server Action is a public POST endpoint, so every field is
 * re-validated by the same schema the composer's caps come from, and
 * the picture is checked here even though the browser checked it.
 */
export async function publishStorePostAction(
  _previous: StorePostState,
  formData: FormData,
): Promise<StorePostState> {
  const storeId = text(formData, "storeId");
  const userId = await authorizedPoster(storeId);
  if (!userId) return { status: "error", message: GENERIC_ERROR };

  const parsed = storePostSchema.safeParse({
    title: text(formData, "title"),
    body: text(formData, "body"),
    eventId: text(formData, "eventId"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
    };
  }

  const rate = checkRateLimit(
    `store-post:${storeId}`,
    STORE_POST_RATE.limit,
    STORE_POST_RATE.windowMs,
  );
  if (!rate.allowed) {
    return {
      status: "error",
      message: "That is a lot of posts for one hour. Give it a little while.",
    };
  }

  const file = formData.get("image");
  const image = file instanceof File && file.size > 0 ? file : null;
  if (image) {
    if (image.size > STORE_IMAGE_MAX_BYTES) {
      return {
        status: "error",
        message: "That picture is over 2MB. Pick a smaller one.",
      };
    }
    if (!(STORE_IMAGE_MIME_TYPES as readonly string[]).includes(image.type)) {
      return {
        status: "error",
        message: "Pictures need to be a PNG, JPEG or WebP.",
      };
    }
  }

  const outcome = await createStorePost(storeId, userId, {
    title: parsed.data.title,
    body: parsed.data.body,
    eventId: parsed.data.eventId,
    image,
  });
  if (!outcome.ok) {
    return {
      status: "error",
      message:
        outcome.reason === "image"
          ? "That picture could not be read. Try another one."
          : outcome.reason === "event"
            ? "That event is not one of yours. Pick one from the list."
            : GENERIC_ERROR,
    };
  }

  /* Followers hear about it after the post exists. Never fails the
     post: the notice is best-effort and logs its own trouble. */
  await notifyStorePost(storeId, outcome.postId, parsed.data.title);

  revalidatePosts(storeId);
  return {
    status: "done",
    message: "Posted. Your followers will see it in their Feed.",
  };
}

/** Take a post down. Bound to the store and the post from the console's list. */
export async function archiveStorePostAction(
  storeId: string,
  postId: string,
): Promise<void> {
  if (!postId) return;
  const userId = await authorizedPoster(storeId);
  if (!userId) return;

  if (await archiveStorePost(storeId, postId)) revalidatePosts(storeId);
}
