import { LoadingScreen } from "@/components/ui/spinner";

/**
 * What the profile pages show while they are being fetched. They wear
 * AppShell, whose header needs the account to draw, so this is the
 * ring alone in a plain main rather than a shell that might not match.
 */
export default function Loading() {
  return (
    <main id="main" className="flex min-h-dvh flex-col px-2 py-10 sm:px-6">
      <LoadingScreen />
    </main>
  );
}
