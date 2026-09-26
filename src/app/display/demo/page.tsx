import type { Metadata } from "next";
import QRCode from "qrcode";

import { DemoDisplay } from "@/components/event-hub/demo-display";
import {
  DEMO_SCENES,
  demoNow,
  demoPayload,
  parseDemoConfig,
} from "@/lib/event-hub/demo";
import { siteUrl } from "@/lib/site";

/**
 * FlareCast, running a sample night.
 *
 * The frame on /ultra points here. It is the real display
 * component on the real payload shape, so the preview is the product;
 * the only differences are that nothing polls, nothing is written, and
 * the code on screen leads back to the store page rather than into a
 * room that does not exist. Never indexed: it is a picture of the
 * product, not a page about it.
 */
export const metadata: Metadata = {
  title: "FlareCast preview",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function DemoDisplayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /* A repeated parameter is somebody editing the address by hand; the
     first value is the one that counts. Anything the parser does not
     recognise falls back to the opening scene. */
  const raw = await searchParams;
  const params = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const config = parseDemoConfig(params) ?? DEMO_SCENES[0].config;
  const back = `${siteUrl()}/ultra`;

  const qrSvg = await QRCode.toString(back, {
    type: "svg",
    errorCorrectionLevel: "Q",
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return (
    <DemoDisplay
      initial={demoPayload(config, demoNow(), back)}
      joinUrl={back}
      qrSvg={qrSvg}
    />
  );
}
