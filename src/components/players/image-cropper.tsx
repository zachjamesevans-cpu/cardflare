"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cropFor, prepareImage, type ImageTarget } from "@/lib/players/image-pipeline";

/**
 * Choosing which part of a photo becomes the picture.
 *
 * The founder asked for two things at once — "ability to crop profile
 * pics and header banners" and a compressor — and they are the same
 * pass: whatever rectangle somebody picks is drawn into a canvas at the
 * final size, and what comes out is both cropped and small.
 *
 * Deliberately two controls and no more. Drag to move, a slider to zoom,
 * and the frame shows exactly what will be kept. A handles-and-corners
 * cropper is a better tool for somebody who wants to spend a minute; the
 * job here is a profile picture, and the person doing it has a phone in
 * one hand.
 */
export function ImageCropper({
  file,
  target,
  /** Width over height of the kept rectangle. 1 for a picture. */
  aspect,
  /** Round frame for an avatar, so the preview matches where it lands. */
  round = false,
  busy = false,
  onCancel,
  onDone,
}: {
  file: File;
  target: ImageTarget;
  aspect: number;
  round?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onDone: (prepared: File) => void;
}) {
  /*
   * Made once, on mount, and released on the way out. A lazy initialiser
   * rather than an effect that sets state: an effect would render the
   * frame empty and then again with the picture, and the parent already
   * remounts this per file with a key.
   */
  const [url] = useState(() => URL.createObjectURL(file));
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [centre, setCentre] = useState({ x: 0.5, y: 0.5 });
  const [working, setWorking] = useState(false);

  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  /* Revoked on the way out. A page somebody tries four photos on
     otherwise holds four of them until the tab closes. */
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const crop = size && cropFor(size.width, size.height, aspect, zoom, centre);

  /* Where to put the image inside the frame so the crop box fills it. */
  const style = crop
    ? {
        width: `${100 / crop.width}%`,
        height: `${100 / crop.height}%`,
        left: `${(-crop.x * 100) / crop.width}%`,
        top: `${(-crop.y * 100) / crop.height}%`,
      }
    : undefined;

  const move = (dx: number, dy: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || !crop) return;

    /* A pixel dragged moves the crop by its share of the visible box,
       so the picture tracks the finger at every zoom. */
    setCentre((current) => ({
      x: current.x - (dx / box.width) * crop.width,
      y: current.y - (dy / box.height) * crop.height,
    }));
  };

  const finish = async () => {
    if (!crop) return;
    setWorking(true);

    try {
      const prepared = await prepareImage(file, target, crop);
      onDone(prepared.file);
    } catch {
      /* An image the browser could not decode. Sending the original is
         the honest fallback — the server checks it and will say why. */
      onDone(file);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-elevated p-4">
      <div
        ref={frame}
        className={`relative w-full overflow-hidden bg-canvas ${
          round ? "mx-auto max-w-56 rounded-full" : "rounded-[var(--radius-control)]"
        }`}
        style={{ aspectRatio: String(aspect) }}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          move(event.clientX - drag.current.x, event.clientY - drag.current.y);
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        {
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={url}
            alt=""
            draggable={false}
            onLoad={(event) =>
              setSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            className="pointer-events-none absolute max-w-none object-cover select-none"
            style={style}
          />
        }
      </div>

      <label className="flex items-center gap-3 text-sm text-text-secondary">
        <span className="shrink-0">Zoom</span>
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="w-full accent-accent"
        />
      </label>

      <p className="text-xs text-text-muted">
        Drag the picture to move it. It is shrunk before it is sent, so a big photo from
        a phone or a Mac is fine.
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void finish()}
          disabled={working || busy || !crop}
        >
          {(working || busy) && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          {working ? "Preparing…" : busy ? "Uploading…" : "Use this"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={working || busy}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
