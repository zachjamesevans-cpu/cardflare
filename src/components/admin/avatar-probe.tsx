"use client";

import { useEffect, useState } from "react";

/**
 * The last hop of the picture pipeline, taken apart.
 *
 * The first probe rendered one `<img>` and said pass or fail, and it
 * earned its keep: it proved the failure lives in the browser while
 * every server hop is green. But "the browser cannot load it" bundles
 * three different failures — the network refused the bytes, the bytes
 * arrived corrupted, or the browser cannot decode the format — and the
 * fix is different for each. So the hop is now three lines:
 *
 *   1. Can this browser decode WebP at all? A 1x1 data URL, no network
 *      involved. iOS Lockdown Mode famously says no here, and it is the
 *      leading suspect: every avatar this feature ever served was WebP,
 *      every one failed on the founder's phone, and every non-WebP image
 *      on the site loads fine.
 *   2. Did the bytes arrive? A fetch of the real URL, reporting status,
 *      type and size — separating "blocked in transit" from "arrived".
 *   3. Do the arrived bytes decode? The fetched bytes rendered from a
 *      blob URL, closing the loop.
 */

/** 1x1 pixels, base64, no network: pure "can you decode this" tests. */
const WEBP_PIXEL =
  "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=";
const JPEG_PIXEL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";

type Verdict = "pending" | "yes" | "no";

function DecodeTest({ label, src }: { label: string; src: string }) {
  const [verdict, setVerdict] = useState<Verdict>("pending");

  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span
        className={`w-32 shrink-0 text-sm font-semibold ${
          verdict === "yes"
            ? "text-success"
            : verdict === "no"
              ? "text-danger"
              : "text-text-muted"
        }`}
      >
        {verdict === "pending" ? "…" : verdict === "yes" ? "OK" : "FAILED"} · {label}
      </span>
      <span className="min-w-0 flex-1 text-xs text-text-muted">
        {verdict === "no"
          ? "This browser refuses the format. No server change can fix that; the format has to change."
          : "A 1x1 test image, decoded locally with no network involved."}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={1}
        height={1}
        className="size-px opacity-0"
        onLoad={() => setVerdict("yes")}
        onError={() => setVerdict("no")}
      />
    </li>
  );
}

export function AvatarProbe({ src }: { src: string }) {
  const [fetched, setFetched] = useState<{ ok: boolean; detail: string } | null>(null);
  const [blobSrc, setBlobSrc] = useState<string | null>(null);
  const [decoded, setDecoded] = useState<Verdict>("pending");

  useEffect(() => {
    let live = true;
    let objectUrl: string | null = null;

    void (async () => {
      try {
        const response = await fetch(src, { cache: "no-store" });
        const type = response.headers.get("content-type") ?? "none";

        if (!response.ok) {
          if (live) {
            setFetched({
              ok: false,
              detail: `The network answered ${response.status}.`,
            });
          }
          return;
        }

        const bytes = await response.blob();
        if (!live) return;

        setFetched({
          ok: true,
          detail: `${response.status}, ${type}, ${(bytes.size / 1024).toFixed(1)}KB arrived.`,
        });

        objectUrl = URL.createObjectURL(bytes);
        setBlobSrc(objectUrl);
      } catch (error) {
        if (live) {
          setFetched({
            ok: false,
            detail: `The request itself failed (${
              error instanceof Error ? error.message : "unknown"
            }). Something between this browser and cardflare.gg refused it.`,
          });
        }
      }
    })();

    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-sm font-semibold text-text-primary">This browser</p>

      <ul className="flex flex-col gap-2">
        <DecodeTest label="Decodes JPEG" src={JPEG_PIXEL} />
        <DecodeTest label="Decodes WebP" src={WEBP_PIXEL} />

        <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className={`w-32 shrink-0 text-sm font-semibold ${
              fetched === null
                ? "text-text-muted"
                : fetched.ok
                  ? "text-success"
                  : "text-danger"
            }`}
          >
            {fetched === null ? "…" : fetched.ok ? "OK" : "FAILED"} · Bytes arrive
          </span>
          <span className="min-w-0 flex-1 text-xs break-all text-text-muted">
            {fetched?.detail ?? "Fetching the picture from this browser…"}
          </span>
        </li>

        <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className={`w-32 shrink-0 text-sm font-semibold ${
              decoded === "pending"
                ? "text-text-muted"
                : decoded === "yes"
                  ? "text-success"
                  : "text-danger"
            }`}
          >
            {decoded === "pending" ? "…" : decoded === "yes" ? "OK" : "FAILED"} ·
            Renders
          </span>
          <span className="min-w-0 flex-1 text-xs text-text-muted">
            {decoded === "yes"
              ? "The arrived bytes decoded into the picture on the left."
              : decoded === "no"
                ? "The bytes arrived but this browser could not decode them. Compare with the format lines above."
                : "Waiting for the bytes."}
          </span>
          {blobSrc && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={blobSrc}
              alt=""
              width={40}
              height={40}
              className="size-10 rounded-full border border-border object-cover"
              onLoad={() => setDecoded("yes")}
              onError={() => setDecoded("no")}
            />
          )}
        </li>
      </ul>

      {/* The raw address, so it can be opened directly in a new tab. */}
      <code className="w-full text-xs break-all text-text-muted">{src}</code>
    </div>
  );
}
