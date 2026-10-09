import { Fragment } from "react";

import { ProMark } from "@/components/stores/ultra-mark";

/**
 * A sentence with the tier in it, the tier drawn as the PRO mark:
 * "Scanning whole binder pages is PRO." The words stay the shared ones
 * (scan-rules.ts and its kind); only the word "Pro" is swapped for
 * `ProMark`, so a sentence the app also says is never retyped here.
 */
export function ProWords({ text }: { text: string }) {
  const parts = text.split(/\bPro\b/);
  return (
    <>
      {parts.map((part, at) => (
        <Fragment key={at}>
          {at > 0 && <ProMark />}
          {part}
        </Fragment>
      ))}
    </>
  );
}
