"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ImageIcon, Loader2, Trash2 } from "lucide-react";

import { ImageCropper } from "@/components/players/image-cropper";
import { checkAvatarFile } from "@/lib/players/profile-image";
import { STORE_PAGE_IDLE, type StorePageState } from "@/lib/stores/page-schema";
import {
  STORE_BANNER_HEIGHT,
  STORE_BANNER_WIDTH,
  STORE_IMAGE_MAX_BYTES,
  STORE_LOGO_SIZE,
} from "@/lib/stores/store-image";
import {
  clearStoreBannerAction,
  clearStoreLogoAction,
  setStoreBannerAction,
  setStoreLogoAction,
} from "@/lib/stores/page-actions";

/**
 * Choosing a store's logo or banner: the player's cover form, with the
 * store's own shapes and actions.
 *
 * The chosen rectangle is drawn into a canvas at the final size before
 * anything is sent, so what leaves the browser is already the picture,
 * already small - a Retina screenshot off a Mac would otherwise be
 * over the bucket's ceiling before it started. The file does not
 * upload the instant it is picked: which part of the photo is the
 * logo is a decision, and the cropper is where it is made.
 */
const SHAPE = {
  logo: {
    label: "logo",
    aspect: 1,
    target: {
      width: STORE_LOGO_SIZE,
      height: STORE_LOGO_SIZE,
      maxBytes: STORE_IMAGE_MAX_BYTES,
    },
    set: setStoreLogoAction,
    clear: clearStoreLogoAction,
    add: "Add a logo",
    change: "Change the logo",
    remove: "Remove the logo",
  },
  banner: {
    label: "banner",
    aspect: STORE_BANNER_WIDTH / STORE_BANNER_HEIGHT,
    target: {
      width: STORE_BANNER_WIDTH,
      height: STORE_BANNER_HEIGHT,
      maxBytes: STORE_IMAGE_MAX_BYTES,
    },
    set: setStoreBannerAction,
    clear: clearStoreBannerAction,
    add: "Add a banner behind the logo",
    change: "Change the banner",
    remove: "Remove the banner",
  },
} as const;

export function StoreImageForm({
  storeId,
  kind,
  current,
}: {
  storeId: string;
  kind: "logo" | "banner";
  /** Whether a picture is set now; decides the wording and the Remove. */
  current: boolean;
}) {
  const shape = SHAPE[kind];
  const [state, action] = useActionState<StorePageState, FormData>(
    shape.set,
    STORE_PAGE_IDLE,
  );
  const [cleared, clearAction] = useActionState<StorePageState, FormData>(
    shape.clear,
    STORE_PAGE_IDLE,
  );

  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  /** The photo being cropped, before it becomes the picture. */
  const [picked, setPicked] = useState<File | null>(null);

  /* The server's answer outranks the client check; the client check is
     cleared on every new pick, so no effect is needed to reconcile. */
  const said =
    state.status !== "idle"
      ? state.message
      : cleared.status !== "idle"
        ? cleared.message
        : clientError;
  const failed =
    state.status === "error" ||
    cleared.status === "error" ||
    (state.status === "idle" && cleared.status === "idle" && clientError !== null);

  return (
    <div className="flex flex-col gap-2">
      <form ref={form} action={action} className="flex flex-col gap-2">
        <input type="hidden" name="storeId" value={storeId} />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary">
          <ImageIcon className="size-4" aria-hidden="true" />
          {current ? shape.change : shape.add}
          <input
            ref={input}
            type="file"
            name={kind}
            /* Every image type the browser can decode; the cropper
               re-encodes to JPEG, so the bucket always gets what it
               accepts. */
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              setClientError(null);
              setPicked(file);
              /* Cleared so picking the same file twice still opens the
                 cropper - a change event does not fire for an identical
                 value. */
              event.currentTarget.value = "";
            }}
          />
          <Pending />
        </label>

        {picked && (
          <ImageCropper
            key={`${picked.name}:${picked.size}:${picked.lastModified}`}
            file={picked}
            aspect={shape.aspect}
            target={shape.target}
            onCancel={() => setPicked(null)}
            onDone={(prepared) => {
              const check = checkAvatarFile(prepared);
              if (!check.ok) {
                setClientError(check.message);
                setPicked(null);
                return;
              }
              const carrier = new DataTransfer();
              carrier.items.add(prepared);
              if (input.current) input.current.files = carrier.files;
              setPicked(null);
              form.current?.requestSubmit();
            }}
          />
        )}
      </form>

      {current && (
        <form action={clearAction}>
          <input type="hidden" name="storeId" value={storeId} />
          <button
            type="submit"
            className="flex items-center gap-2 text-sm text-text-muted transition-colors hover:text-danger"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {shape.remove}
          </button>
        </form>
      )}

      {said && (
        <p
          role="status"
          className={failed ? "text-sm text-danger" : "text-sm text-success"}
        >
          {said}
        </p>
      )}
    </div>
  );
}

function Pending() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" />;
}
