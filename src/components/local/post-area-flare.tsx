"use client";

import { useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";

import { CardSearch } from "@/components/cards/card-search";
import type { CardPrinting, CardResult } from "@/lib/cards/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { postAreaFlareAction } from "@/lib/local/actions";

/**
 * Saying what you are hunting, without being in a room.
 *
 * The founder's whole brief for Local: "people can see all flares nearby
 * and can message people directly. should be intuitive." Everything that
 * makes this intuitive is a subtraction — no room to join, no code to
 * scan, no store to pick, no form to fill. Search a card, tap it, it is
 * up. Terms and quantities are defaults a player can leave alone, because
 * the common case is one copy, happy to trade, and asking about the
 * uncommon case first is how a two-tap thing becomes a screen.
 *
 * It posts, it does not publish a list. A saved want stays private; this
 * is the deliberate act of being visible, and the difference is the whole
 * privacy story.
 */
export function PostAreaFlare({
  imagesEnabled,
  onPosted,
}: {
  imagesEnabled: boolean;
  /** Refresh the list, so the new Flare appears where it will live. */
  onPosted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const post = (card: CardResult, printing?: CardPrinting) => {
    setMessage(null);
    setFailed(false);

    startTransition(async () => {
      const result = await postAreaFlareAction({
        cardId: card.id,
        printingId: printing?.id ?? null,
      });

      if (result.ok) {
        setOpen(false);
        setMessage(`${card.exactName} is up. People near you can see it now.`);
        onPosted();
        return;
      }

      setFailed(true);
      setMessage(result.message);
    });
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <p className="font-semibold text-text-primary">What are you hunting?</p>
        <p className="text-xs text-text-muted">
          Post it here and anyone near you can say they have it. No room needed.
        </p>
      </div>

      {open ? (
        <div className="flex flex-col gap-3">
          <CardSearch imagesEnabled={imagesEnabled} onSelect={post} autoFocus />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="self-start text-xs text-text-muted underline underline-offset-2 hover:text-text-secondary"
          >
            Never mind
          </button>
        </div>
      ) : (
        <Button
          type="button"
          className="w-full sm:w-auto sm:self-start"
          onClick={() => {
            setMessage(null);
            setOpen(true);
          }}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-4" aria-hidden="true" />
          )}
          {pending ? "Posting…" : "Post a card"}
        </Button>
      )}

      {message && (
        /* A refusal and a confirmation are different things and get
           different colours. The commonest refusal — no ZIP yet — is one
           field away from working, not a fault. */
        <p className={failed ? "text-sm text-danger" : "text-sm text-accent"}>
          {message}
        </p>
      )}
    </Card>
  );
}
