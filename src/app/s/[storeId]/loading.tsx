import { TabPageShell } from "@/components/players/tab-page-shell";
import { LoadingScreen } from "@/components/ui/spinner";

/**
 * What a store's page shows while it is being fetched: the same chrome the page
 * wears, with the ring in the middle. The logo and the tab bar are
 * already in place, so the page arriving only fills the middle in.
 */
export default function Loading() {
  return (
    <TabPageShell title="Store">
      <LoadingScreen />
    </TabPageShell>
  );
}
