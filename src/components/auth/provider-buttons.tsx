import { Button } from "@/components/ui/button";
import { signInWithProvider } from "@/lib/auth/actions";
import {
  enabledProviders,
  PROVIDER_LABELS,
  type OAuthProvider,
} from "@/lib/auth/providers";

/**
 * Social sign-in buttons, for providers this deployment has actually
 * configured.
 *
 * Renders nothing at all when none are — no divider, no empty panel, no
 * greyed-out button hinting at something that does not work. A control that
 * looks interactive has to work, and the honest way to show an unconfigured
 * provider is not to show it.
 *
 * A Server Component: each button is its own form posting to a Server Action,
 * so this ships no JavaScript.
 */
export function ProviderButtons({ next }: { next?: string }) {
  const providers = enabledProviders();

  if (providers.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {providers.map((provider) => (
          <ProviderButton key={provider} provider={provider} next={next} />
        ))}
      </div>

      {/* A rule with the word sitting in it, matching the printed join sheet. */}
      <div
        className="flex items-center gap-3 text-xs tracking-[0.2em] text-text-muted uppercase"
        aria-hidden="true"
      >
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

function ProviderButton({
  provider,
  next,
}: {
  provider: OAuthProvider;
  next?: string;
}) {
  return (
    <form action={signInWithProvider}>
      <input type="hidden" name="provider" value={provider} />
      {next && <input type="hidden" name="next" value={next} />}
      <Button type="submit" variant="secondary" size="lg" className="w-full">
        Continue with {PROVIDER_LABELS[provider]}
      </Button>
    </form>
  );
}
