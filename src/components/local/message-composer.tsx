"use client";

import { useLayoutEffect, useRef } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/controls";
import { COMPOSER_MAX_LINES } from "@/lib/local/message-runs";
import { MESSAGE_MAX_LENGTH } from "@/lib/local/shared";

/**
 * The message box under a conversation. One line to start, growing
 * with what is typed up to COMPOSER_MAX_LINES lines, then scrolling
 * inside itself rather than pushing the conversation off the screen.
 * The app's composer stops at the same five lines.
 *
 * Enter sends and Shift+Enter is a new line, the way every web chat
 * works; a key held mid-composition (an IME choosing a character) is
 * left alone. The caller tidies and refuses an empty message.
 */
export function MessageComposer({
  value,
  onChange,
  onSend,
  pending,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  pending: boolean;
}) {
  const box = useRef<HTMLTextAreaElement>(null);

  /* Measure, then cap: height follows the text up to five lines. */
  useLayoutEffect(() => {
    const field = box.current;
    if (!field) return;
    const style = getComputedStyle(field);
    const px = (value: string) => Number.parseFloat(value) || 0;
    const line = px(style.lineHeight) || px(style.fontSize) * 1.25 || 20;
    const padding = px(style.paddingTop) + px(style.paddingBottom);
    const border = px(style.borderTopWidth) + px(style.borderBottomWidth);
    const cap = line * COMPOSER_MAX_LINES + padding + border;

    field.style.height = "auto";
    const wanted = field.scrollHeight + border;
    field.style.height = `${Math.min(wanted, cap)}px`;
    field.style.overflowY = wanted > cap ? "auto" : "hidden";
  }, [value]);

  return (
    <div className="flex items-end gap-2">
      <Textarea
        ref={box}
        rows={1}
        maxLength={MESSAGE_MAX_LENGTH}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing)
            return;
          event.preventDefault();
          if (!pending) onSend();
        }}
        aria-label="Message"
        placeholder="Message…"
        className="min-h-0! flex-1 resize-none! py-2! leading-6"
      />
      <Button type="button" size="sm" onClick={onSend} disabled={pending}>
        <Send className="size-4" aria-hidden="true" />
        Send
      </Button>
    </div>
  );
}
