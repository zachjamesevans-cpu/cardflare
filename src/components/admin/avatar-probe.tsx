"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";

/**
 * The last hop of the picture pipeline: THIS browser fetching the image.
 *
 * The server-side checks next to this prove the row, the bucket and the
 * route; none of them can prove the founder's phone can fetch the
 * result, and the phone is where every failure so far has surfaced. A
 * deliberately plain `<img>` — not next/image — so there is exactly one
 * thing under test: an HTTP GET for the picture from this device.
 */
export function AvatarProbe({ src }: { src: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={40}
        height={40}
        className="size-10 rounded-full border border-border object-cover"
        onLoad={() => setState("loaded")}
        onError={() => setState("failed")}
      />

      <p
        role="status"
        className={`flex items-center gap-1.5 text-sm ${
          state === "loaded"
            ? "text-success"
            : state === "failed"
              ? "text-danger"
              : "text-text-muted"
        }`}
      >
        {state === "loading" && (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        )}
        {state === "loaded" && <Check className="size-3.5" aria-hidden="true" />}
        {state === "failed" && <X className="size-3.5" aria-hidden="true" />}
        {state === "loading"
          ? "This browser is fetching the picture…"
          : state === "loaded"
            ? "This browser CAN load the picture."
            : "This browser CANNOT load the picture, even though the checks above passed."}
      </p>

      {/* The raw address, so it can be opened directly in a new tab. */}
      <code className="w-full text-xs break-all text-text-muted">{src}</code>
    </div>
  );
}
