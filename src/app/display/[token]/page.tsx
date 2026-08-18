import type { Metadata } from "next";

import { DisplayScreen } from "@/components/event-hub/display-screen";
import { Logo } from "@/components/brand/logo";
import { displayPayload } from "@/lib/event-hub/display-payload";
import { findDisplayByToken } from "@/lib/event-hub/repository";
import { joinQrSvg } from "@/lib/events/qr";

export const metadata: Metadata = {
  title: "Event Hub",
  /* Never indexed. A display token is not a secret worth much, but it is
     certainly not something a search engine should be handing out. */
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/**
 * The television.
 *
 * Rendered once on the server so the wall is correct on the very first
 * frame — a shop plugging in an HDMI stick should not watch a spinner —
 * and then kept current by the client polling `/api/display/[token]`.
 *
 * No `AppShell`, no navigation, no sign-in. The token is the whole of
 * the authentication and it reaches exactly one read-only payload:
 * nobody is signing a store account into a browser that lives on a
 * shelf, and if they did, that browser would be holding an account that
 * can rewrite the store's inventory.
 */
export default async function DisplayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const display = await findDisplayByToken(token);

  if (!display) return <NotConnected />;

  const payload = await displayPayload(display);

  /* Encoded here, once. The store's counter code does not change while a
     television is switched on. */
  const qrSvg = payload.joinCode ? await joinQrSvg(payload.joinCode) : null;

  return <DisplayScreen initial={payload} token={token} qrSvg={qrSvg} />;
}

/**
 * The same screen for a wrong token, a retired one and a deleted
 * display. There is nothing to learn here by guessing, and a shop
 * staring at a television needs a next step rather than a status code.
 */
function NotConnected() {
  return (
    <main
      id="main"
      className="flex h-dvh flex-col items-center justify-center gap-6 bg-canvas p-8 text-center"
    >
      <Logo size={56} />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-text-primary">Display not connected</h1>
        <p className="max-w-md text-text-secondary">
          This link is no longer live. Open the Event Hub in your store console and use
          the current display link.
        </p>
      </div>
    </main>
  );
}
