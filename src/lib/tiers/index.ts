import { manifest as pro } from "./pro";
import { manifest as ultra } from "./ultra";
import { manifest as max } from "./max";

/**
 * Membership tiers: free, pro, ultra, max.
 *
 * The founder's structure: each paid tier owns a folder here, and that
 * folder's manifest declares what the tier can do. Nothing in the
 * product reads these capabilities yet - the first real one (animated
 * GIF profile pictures for pro and up) ships when the upload pipeline
 * grows a GIF path - but the admin console can already place a player
 * on a tier, so the day a capability lands it applies instantly.
 *
 * Capabilities accumulate upward: ultra has everything pro has, max
 * has everything ultra has. A tier folder only declares what it ADDS.
 */

export const TIERS = ["free", "pro", "ultra", "max"] as const;
export type Tier = (typeof TIERS)[number];

export type TierCapability = keyof typeof pro | keyof typeof ultra | keyof typeof max;

const LADDER: Record<Tier, Partial<Record<TierCapability, boolean>>> = {
  free: {},
  pro: { ...pro },
  ultra: { ...pro, ...ultra },
  max: { ...pro, ...ultra, ...max },
};

export function isTier(value: string | null | undefined): value is Tier {
  return (TIERS as readonly string[]).includes(value ?? "");
}

/** Whether a player's tier includes a capability. Unknown tiers are free. */
export function tierAllows(tier: string | null, capability: TierCapability): boolean {
  const key: Tier = isTier(tier) ? tier : "free";
  return LADDER[key][capability] === true;
}
