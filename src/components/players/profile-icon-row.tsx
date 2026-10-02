import Link from "next/link";
import {
  ArrowLeftRight,
  BookOpen,
  Crosshair,
  Flame,
  Settings,
  type LucideIcon,
} from "lucide-react";

/**
 * The destinations on a profile: a row of round icons under the
 * header, each one a door to a deeper screen.
 *
 * The founder, on the profile before this: it "feels cluttered and
 * more like a management dashboard than a social profile"; so "use a
 * more Instagram-like information architecture where important
 * features are represented as clear destinations/icons and users only
 * see deeper information after tapping into them." The hunts, the
 * binders, the trade history, the Embers store and the settings used
 * to be panels and cards stacked down the page. They are five circles
 * now, and the page underneath is the profile.
 *
 * Your own: Hunts, Binders, Trades, Embers, Settings. Somebody else's:
 * Hunts and Binders only; the other three are yours alone. No box
 * around the row, and the circles have no border: the founder, "fewer
 * giant bordered boxes". The app's profile-icon-row.tsx draws the same
 * five, in the same order, with the same words.
 */

interface Destination {
  label: string;
  href: string;
  icon: LucideIcon;
}

function destinationsFor(yours: boolean, base: string): Destination[] {
  const shared: Destination[] = [
    { label: "Hunts", href: `${base}/hunts`, icon: Crosshair },
    { label: "Binders", href: `${base}/binders`, icon: BookOpen },
  ];
  if (!yours) return shared;
  return [
    ...shared,
    { label: "Trades", href: "/profile/trades", icon: ArrowLeftRight },
    { label: "Embers", href: "/profile/store", icon: Flame },
    { label: "Settings", href: "/profile/settings", icon: Settings },
  ];
}

export function ProfileIconRow({
  yours,
  base = "/profile",
}: {
  /** The viewer's own profile: all five doors, on /profile paths. */
  yours: boolean;
  /** Where Hunts and Binders live: "/profile", or "/p/<id>". */
  base?: string;
}) {
  const destinations = destinationsFor(yours, yours ? "/profile" : base);

  return (
    <nav aria-label={yours ? "Your profile" : "This profile"}>
      <ul className="flex items-start justify-evenly gap-1">
        {destinations.map((destination) => (
          <li key={destination.label} className="flex min-w-0 flex-col items-center">
            <Link
              href={destination.href}
              className="flex flex-col items-center gap-1.5 rounded-[var(--radius-control)] px-1 py-1 text-text-secondary transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              {/* A 44px circle, the elevated surface, no border. */}
              <span className="flex size-11 items-center justify-center rounded-full bg-elevated text-text-primary">
                <destination.icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-[11px] leading-none font-medium">
                {destination.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
