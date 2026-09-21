import { LoadingScreen } from "@/components/ui/spinner";

/**
 * What every store console page shows while it is being fetched: the
 * ring, centred, in a plain main. The console's header needs the store
 * and the account to draw, so nothing here pretends to be it.
 */
export default function Loading() {
  return (
    <main id="main" className="flex min-h-dvh flex-col px-2 py-10 sm:px-6">
      <LoadingScreen />
    </main>
  );
}
