import { Fragment } from "react";

import { ProMark } from "./pro-mark";

/**
 * A sentence with the tier in it, the tier drawn as the PRO mark:
 * "Scanning whole binder pages is PRO." The words stay the shared ones
 * (scan-copy.ts and its kind); only the word "Pro" is swapped for
 * `ProMark`, the website's ProWords (src/components/stores/pro-words.tsx)
 * line for line. Drawn inside a Text, so the mark sits in the line.
 */
export function ProWords({ text, size = 14 }: { text: string; size?: number }) {
  const parts = text.split(/\bPro\b/);
  return (
    <>
      {parts.map((part, at) => (
        <Fragment key={at}>
          {at > 0 ? <ProMark size={size} /> : null}
          {part}
        </Fragment>
      ))}
    </>
  );
}
