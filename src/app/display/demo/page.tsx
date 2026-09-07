import type { Metadata } from "next";
import QRCode from "qrcode";

import { DisplayScreen } from "@/components/event-hub/display-screen";
import { demoDisplayPayload, demoNow, isDemoScene } from "@/lib/event-hub/demo";
import { siteUrl } from "@/lib/site";

/**
 * FlareCast, running a sample night.
 *
 * The frame on /for-stores points here. It is the real display
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
  searchParams: Promise<{ scene?: string }>;
}) {
  const { scene } = await searchParams;
  const chosen = isDemoScene(scene) ? scene : "focus";
  const back = `${siteUrl()}/for-stores`;

  const qrSvg = await QRCode.toString(back, {
    type: "svg",
    errorCorrectionLevel: "Q",
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return (
    <DisplayScreen
      initial={demoDisplayPayload(chosen, demoNow(), back)}
      token={null}
      qrSvg={qrSvg}
    />
  );
}
