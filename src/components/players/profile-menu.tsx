"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Flag, UserRoundCheck } from "lucide-react";

import { BlockConfirmSheet, useBlockState } from "@/components/players/block-controls";
import { ReportSheet } from "@/components/players/report-sheet";
import { DotsMenu, type MenuItem } from "@/components/ui/menu";
import { unblockPlayerAction } from "@/lib/players/safety-actions";

/**
 * The three dots beside Share on somebody else's profile.
 *
 * Report, and Block or Unblock: the two things the audit asked for, in
 * the corner every social app keeps them in. Block asks once more
 * before it does anything; Unblock does not, because taking a block
 * back costs nothing. The app draws the same two items behind its
 * DotsButton (mobile/src/screens/player-profile.tsx).
 */
export function ProfileMenu({ playerId, name }: { playerId: string; name: string }) {
  const router = useRouter();
  const { blocked, setBlocked } = useBlockState();
  const [sheet, setSheet] = useState<"report" | "block" | null>(null);
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
      router.refresh();
    });
  };

  const items: MenuItem[] = [
    {
      key: "report",
      label: "Report",
      icon: <Flag />,
      onSelect: () => setSheet("report"),
    },
    blocked
      ? {
          key: "unblock",
          label: "Unblock",
          icon: <UserRoundCheck />,
          onSelect: unblock,
        }
      : {
          key: "block",
          label: "Block",
          icon: <Ban />,
          onSelect: () => setSheet("block"),
        },
  ];

  return (
    <>
      {/* The same round, frosted button Share wears, so the two read as
          one pair of controls over the cover. */}
      <span className="flex size-10 items-center justify-center rounded-full border border-border bg-surface/80 text-text-secondary backdrop-blur">
        <DotsMenu items={items} label={`More about ${name}`} />
      </span>
      {error && (
        <span
          role="alert"
          className="absolute top-full right-0 mt-1 text-xs text-danger"
        >
          {error}
        </span>
      )}
      <ReportSheet
        open={sheet === "report"}
        onClose={() => setSheet(null)}
        kind="player"
        targetId={playerId}
      />
      <BlockConfirmSheet
        open={sheet === "block"}
        onClose={() => setSheet(null)}
        playerId={playerId}
        name={name}
      />
    </>
  );
}
