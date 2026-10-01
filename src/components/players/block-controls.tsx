"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Ban, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { BlockState } from "@/lib/players/safety";
import { blockPlayerAction, unblockPlayerAction } from "@/lib/players/safety-actions";

/**
 * The block, as the viewer's page shows it.
 *
 * Two islands on a profile need the same fact: the three dots in the
 * corner (Block or Unblock) and the row under the name (Follow and
 * Message, or the Blocked chip). They share it through this provider,
 * seeded from `blockState` on the server, so a block taken from the
 * menu changes the row at once, and nothing waits on a round trip to
 * say what the viewer just did.
 *
 * Quiet in both directions. When THEY have blocked the viewer the row
 * is simply empty: no Follow, no Message, no chip, nothing to explain.
 */

interface BlockContextValue extends BlockState {
  setBlocked: (blocked: boolean) => void;
}

const BlockContext = createContext<BlockContextValue>({
  blocked: false,
  blockedBy: false,
  setBlocked: () => {},
});

export function BlockProvider({
  initial,
  children,
}: {
  initial: BlockState;
  children: ReactNode;
}) {
  const [blocked, setBlocked] = useState(initial.blocked);
  return (
    <BlockContext.Provider
      value={{ blocked, blockedBy: initial.blockedBy, setBlocked }}
    >
      {children}
    </BlockContext.Provider>
  );
}

export function useBlockState(): BlockContextValue {
  return useContext(BlockContext);
}

/**
 * Follow and Message, or what stands in for them.
 *
 * The children are the ordinary row. Once the viewer has blocked this
 * player the row becomes a muted "Blocked" chip and a way back; when
 * this player has blocked the viewer the row is empty.
 */
export function BlockControls({
  playerId,
  children,
}: {
  playerId: string;
  children: ReactNode;
}) {
  const { blocked, blockedBy } = useBlockState();

  if (blockedBy) return null;
  if (!blocked) return <>{children}</>;

  return (
    <>
      <span className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-border bg-elevated px-3 text-sm font-semibold text-text-muted">
        <Ban className="size-4" aria-hidden="true" />
        Blocked
      </span>
      <UnblockButton playerId={playerId} className="flex-1" />
    </>
  );
}

/** "Unblock", the ghost button, wherever a block can be taken back. */
export function UnblockButton({
  playerId,
  className,
  onDone,
}: {
  playerId: string;
  className?: string;
  /** After the server agrees, for a list that drops the row. */
  onDone?: () => void;
}) {
  const router = useRouter();
  const { setBlocked } = useBlockState();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const unblock = () => {
    if (pending) return;
    setError(null);
    start(async () => {
      const result = await unblockPlayerAction(playerId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setBlocked(false);
      onDone?.();
      router.refresh();
    });
  };

  return (
    <span className={className}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={unblock}
        disabled={pending}
        className="w-full"
      >
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        Unblock
      </Button>
      {error && (
        <span role="alert" className="block text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}

/**
 * The second step of Block: what it does, and the one word to confirm.
 *
 * "They are not told" is the promise the whole feature rests on, so it
 * is said here, on the one screen where the viewer decides.
 */
export function BlockConfirmSheet({
  open,
  onClose,
  playerId,
  name,
}: {
  open: boolean;
  onClose: () => void;
  playerId: string;
  name: string;
}) {
  const router = useRouter();
  const { setBlocked } = useBlockState();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const block = () => {
    if (pending) return;
    setError(null);
    start(async () => {
      const result = await blockPlayerAction(playerId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setBlocked(true);
      onClose();
      router.refresh();
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Block"
      footer={
        <div className="flex gap-2">
          <Button
            type="button"
            variant="danger"
            size="md"
            className="flex-1"
            onClick={block}
            disabled={pending}
          >
            {pending ? "Blocking…" : "Block"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="flex-1"
            onClick={onClose}
            disabled={pending}
          >
            Keep
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="font-semibold text-text-primary">Block {name}?</p>
        <p className="text-sm text-text-secondary">
          You will not see their posts, and neither of you can message the other. They
          are not told.
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
