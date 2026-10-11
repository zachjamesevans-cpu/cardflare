/**
 * The made-up people demo mode fills the app with. Nobody here is a
 * real account: the founder, "use made up people. make sure they have
 * profile pictures though."
 *
 * Their pictures are DiceBear illustrations drawn from the name, in
 * styles whose licences ask nothing of us (Lorelei, Notionists and Open
 * Peeps are CC0; Avataaars is free for commercial use), so a screenshot
 * can go on the App Store and in an ad without a face that belongs to a
 * stranger. Each wears a ring or an aura from the real catalogue, so
 * the cosmetics show the way they do on a busy night.
 */

export interface DemoPerson {
  playerId: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
  ring: string | null;
  aura: string | null;
  frame: string | null;
  bio: string;
  /** Miles from you, for Nearby. */
  miles: number;
}

const avatar = (style: string, seed: string, background: string) =>
  `https://api.dicebear.com/9.x/${style}/png?seed=${encodeURIComponent(
    seed,
  )}&size=256&backgroundColor=${background}`;

const person = (
  key: string,
  displayName: string,
  style: string,
  background: string,
  extra: Partial<DemoPerson> & { bio: string; miles: number },
): DemoPerson => ({
  playerId: `demo-${key}`,
  displayName,
  handle: key,
  avatarUrl: avatar(style, displayName, background),
  ring: null,
  aura: null,
  frame: null,
  ...extra,
});

export const PEOPLE = {
  kaito: person("kaito", "Kaito", "notionists", "b6e3f4", {
    ring: "ring-galaxy",
    aura: "aura-stars",
    bio: "Charizard collector. Locals every Friday at Card Cavern.",
    miles: 1.2,
  }),
  maya: person("maya", "Maya Chen", "lorelei", "ffd5dc", {
    ring: "ring-sakura",
    aura: "aura-sakura",
    bio: "Straw Hat Crew completionist. Trades over sales, always.",
    miles: 0.6,
  }),
  jordan: person("jordan", "Jordan B", "avataaars", "c0aede", {
    ring: "ring-ember",
    bio: "Red Shanks leader main. Binder's open, ask away.",
    miles: 3.4,
  }),
  priya: person("priya", "Priya", "lorelei", "d1d4f9", {
    ring: "ring-aurora",
    bio: "Pulling for alt arts. Happy to trade doubles.",
    miles: 2.1,
  }),
  leo: person("leo", "Leo Okafor", "open-peeps", "ffdfbf", {
    ring: "ring-electric",
    bio: "OP judge on weekends. Ask me about rulings.",
    miles: 5.8,
  }),
  sam: person("sam", "Sam Rivera", "notionists", "c1f4c5", {
    ring: "ring-gold-foil",
    bio: "Vintage Pokémon + One Piece. Base set forever.",
    miles: 4.3,
  }),
  hana: person("hana", "Hana", "lorelei", "b6e3f4", {
    ring: "ring-water",
    aura: "aura-bubbles",
    bio: "Gengar everything. Ghost types only.",
    miles: 7.5,
  }),
  theo: person("theo", "Theo W", "avataaars", "ffd5dc", {
    ring: "ring-crown",
    bio: "Store regular at Grand Line Games.",
    miles: 1.9,
  }),
  ava: person("ava", "Ava Kim", "open-peeps", "c0aede", {
    ring: "ring-heart",
    aura: "aura-hearts",
    bio: "Nami and Robin collector.",
    miles: 2.7,
  }),
  marcus: person("marcus", "Marcus", "notionists", "ffdfbf", {
    ring: "ring-black-flame",
    bio: "Purple Luffy enjoyer.",
    miles: 9.1,
  }),
  zoe: person("zoe", "Zoe P", "lorelei", "c1f4c5", {
    ring: "ring-diamond",
    bio: "Umbreon or nothing.",
    miles: 3.9,
  }),
  eli: person("eli", "Eli Novak", "avataaars", "d1d4f9", {
    ring: "ring-frozen",
    bio: "Building Law for regionals.",
    miles: 6.2,
  }),
} satisfies Record<string, DemoPerson>;

export type DemoPersonKey = keyof typeof PEOPLE;

export const personById = (playerId: string): DemoPerson | undefined =>
  Object.values(PEOPLE).find((p) => p.playerId === playerId);
