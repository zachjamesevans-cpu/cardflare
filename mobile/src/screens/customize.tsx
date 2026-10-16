import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import type { StackParams } from "../../App";
import { getCustomize, type CustomizeKind, type CustomizeSection } from "../api";
import { CosmeticCard } from "../cosmetic-card";
import { cachedPlayerId, readCache, writeCache } from "../cache";
import { drawsBorder } from "../cosmetic-border";
import { CosmeticFilm, type ArtFile } from "../cosmetic-film";
import { usePendingLook, type LookDraft } from "../look-save";
import {
  TrackedView,
  WornBackground,
  WornScene,
  drawsAnimation,
  drawsBackground,
  drawsPattern,
  drawsScene,
} from "../cosmetic-paint";
import { WornAura, WornRing } from "../cosmetic-worn";
import { WornBadge, WornName, WornTitle } from "../worn-name";
import {
  SCENE_ART,
  hasAuraArt,
  hasBadgeArt,
  hasNameArt,
  hasRingArt,
  hasTitleArt,
} from "../cosmetic-art-data";
import { Card, Muted, Tap } from "../ui";
import { PlayerAvatar } from "../player-avatar";
import { ProMark } from "../pro-mark";
import { colors, gutter, radius, spacing } from "../theme";

/**
 * Getting dressed, in one place — the same hub the website has at
 * /profile/customize: every category, everything you own, tap to wear
 * it, tap again to take it off. Same sections, same wording, same
 * badges, per the parity rule.
 *
 * Every catalogue family draws here now, and every tile carries a
 * preview of the real thing: the same components the profile and the
 * showcase use, so a tile and a profile cannot show different things.
 * Wearing something here equips it everywhere.
 *
 * WHY EVERY TILE CARRIES A PREVIEW. A picker that lists
 * twenty-five profile borders as twenty-five lines of text is a picker
 * where nobody can tell Inferno from Aurora, and it is most of why the
 * founder reported "animated profile borders still aren't working on
 * the app" after they had started working: there was nowhere in the app
 * that drew one. The preview is the real `WornRing` and `WornAura`
 * around a stand-in face, the same components the avatar uses, so a
 * tile and a profile cannot show different things.
 */

/** The two wands' menus, mirroring the website's EQUIP_AREAS split. */
const AREA_KINDS: Record<"profile" | "showcase", readonly CustomizeKind[]> = {
  profile: ["ring", "aura", "nameplate", "title", "badge", "scene"],
  showcase: ["border", "pattern", "animation", "background"],
};


const SECTION_COPY: Record<CustomizeKind, { title: string; blurb: string }> = {
  ring: { title: "Profile borders", blurb: "Drawn around your profile picture." },
  aura: {
    title: "Avatar effects",
    blurb: "Animations floating around your picture. Mix with any border.",
  },
  border: { title: "Card borders", blurb: "Around every card in your showcase." },
  pattern: { title: "Holo patterns", blurb: "The foil across your cards." },
  animation: { title: "Card animations", blurb: "How your showcase cards move." },
  background: {
    title: "Showcase backgrounds",
    blurb: "Behind your showcase rail.",
  },
  scene: { title: "Profile effects", blurb: "Across your whole profile page." },
  nameplate: { title: "Name styles", blurb: "How your username is drawn." },
  title: { title: "Titles", blurb: "The line under your name." },
  badge: { title: "Badges", blurb: "The mark beside your name." },
};

/**
 * What a profile border or an avatar effect actually looks like.
 *
 * A stand-in face rather than the player's own picture, because the
 * customize payload does not carry one and a round trip for it would
 * buy a nicer preview at the cost of a slower screen. The website's
 * `.cfx-preview-face` makes the same trade for the same reason.
 *
 * The ring goes under and the effect goes over, the same order the
 * avatar draws them in, so what a tile shows is what a profile shows.
 */
export function CosmeticPreview({ kind, slug }: { kind: CustomizeKind; slug: string }) {
  /* A name style previews on a name - the same one the website uses. */
  if (kind === "nameplate" && hasNameArt(slug)) {
    return (
      <WornName
        name="CHUNC"
        nameplate={slug}
        fontSize={16}
        baseStyle={{ fontSize: 16, fontWeight: "800", color: colors.textPrimary }}
      />
    );
  }

  if (kind === "badge" && hasBadgeArt(slug)) {
    return <WornBadge badge={slug} />;
  }

  if (kind === "title" && hasTitleArt(slug)) {
    return <WornTitle title={slug} />;
  }

  /* A card border previews on a card, because that is where it goes;
     a holo pattern the same, on an empty face. */
  if (kind === "border" && drawsBorder(slug)) {
    return (
      <CosmeticCard
        imageUrl={null}
        width={PREVIEW - 8}
        frame={null}
        holo={null}
        effect={null}
        border={slug}
      />
    );
  }

  if (kind === "pattern" && drawsPattern(slug)) {
    return (
      <CosmeticCard
        imageUrl={null}
        width={PREVIEW - 8}
        frame={null}
        holo={null}
        effect={null}
        pattern={slug}
      />
    );
  }

  /* A card animation previews on an empty card, which it moves, paints
     over or edges, exactly as it would a showcase card. */
  if (kind === "animation" && drawsAnimation(slug)) {
    return (
      <CosmeticCard
        imageUrl={null}
        width={PREVIEW - 8}
        frame={null}
        holo={null}
        effect={null}
        animation={slug}
      />
    );
  }

  /* A profile effect previews over a mini profile, as the website's
     `.cfx-panel-profile` swatch does. The avatar entrance plays only
     on that mini avatar, so it is previewed by its own rule. */
  if (kind === "scene" && (drawsScene(slug) || SCENE_ART[slug]?.avatarTiming)) {
    return <ScenePreview slug={slug} />;
  }

  /* A showcase background previews as the panel it paints: the
     website's 16:10 swatch, at the tile's height. */
  if (kind === "background" && drawsBackground(slug)) {
    return (
      <View
        style={{
          width: SWATCH.w,
          height: SWATCH.h,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.canvas,
          overflow: "hidden",
        }}
      >
        <WornBackground
          background={slug}
          width={SWATCH.w - 2}
          height={SWATCH.h - 2}
          radius={7}
        />
      </View>
    );
  }

  const ring = kind === "ring" && hasRingArt(slug) ? slug : null;
  const aura = kind === "aura" && hasAuraArt(slug) ? slug : null;

  /* Nothing drawable: no empty circle standing in for art that is not
     there, which would read as "this cosmetic is a grey dot". */
  if (!ring && !aura) return null;

  return (
    <View
      style={{
        width: PREVIEW,
        height: PREVIEW,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <WornRing ring={ring} size={PREVIEW} />
      <View
        style={{
          width: PREVIEW,
          height: PREVIEW,
          borderRadius: PREVIEW / 2,
          backgroundColor: colors.canvas,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      />
      <WornAura aura={aura} size={PREVIEW} />
    </View>
  );
}

/**
 * The website's `.cfx-panel-profile`, under a scene: a block near the
 * bottom of the panel with a round avatar straddling its top edge and
 * two muted lines where the name and the handle go. The scene plays
 * over it, so the preview shows snow falling past a face rather than
 * snow on nothing. `scene-avatar-entrance` is the one scene with no
 * panel art at all: it pops the avatar in, so the avatar is a
 * `TrackedView` playing its track.
 */
function ScenePreview({ slug }: { slug: string }) {
  const avatarTiming = SCENE_ART[slug]?.avatarTiming ?? null;
  const inner = { w: SCENE_SWATCH.w - 2, h: SCENE_SWATCH.h - 2 };
  /* `inset: auto 12% 14% 12%; height: 46%`, as the stylesheet has it. */
  const block = {
    left: inner.w * 0.12,
    width: inner.w * 0.76,
    top: inner.h * (1 - 0.14 - 0.46),
    height: inner.h * 0.46,
  };

  return (
    <View
      style={{
        width: SCENE_SWATCH.w,
        height: SCENE_SWATCH.h,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.canvas,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          position: "absolute",
          left: block.left,
          top: block.top,
          width: block.width,
          height: block.height,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <View
          style={{
            position: "absolute",
            left: "22%",
            right: "22%",
            top: "58%",
            height: 2,
            backgroundColor: colors.border,
          }}
        />
        <View
          style={{
            position: "absolute",
            left: "30%",
            right: "30%",
            top: "58%",
            marginTop: 8,
            height: 2,
            backgroundColor: colors.border,
            opacity: 0.7,
          }}
        />
      </View>
      <View
        style={{
          position: "absolute",
          left: inner.w / 2 - MINI_AVATAR / 2,
          top: block.top - MINI_AVATAR / 2,
        }}
      >
        <TrackedView
          timings={avatarTiming ? [avatarTiming] : []}
          width={MINI_AVATAR}
          height={MINI_AVATAR}
        >
          <View
            style={{
              width: MINI_AVATAR,
              height: MINI_AVATAR,
              borderRadius: MINI_AVATAR / 2,
              backgroundColor: colors.elevated,
              borderWidth: 2,
              borderColor: colors.border,
            }}
          />
        </TrackedView>
      </View>
      <WornScene scene={slug} width={inner.w} height={inner.h} radius={7} />
    </View>
  );
}

/** Big enough to read a gradient off, small enough for a list row. */
const PREVIEW = 36;

/** The background swatch: 16:10 like the website's panel, a row tall. */
const SWATCH = { w: Math.round(PREVIEW * 1.6), h: PREVIEW };

/** The scene swatch: the same 16:10, two rows tall, so a 32-point
    avatar and the block under it fit the way the website draws them. */
const SCENE_SWATCH = { w: SWATCH.w * 2, h: SWATCH.h * 2 };

/** The mini profile's avatar: the website's 32px circle. */
const MINI_AVATAR = 32;

/** The wardrobe as it is kept between visits. */
interface CachedWardrobe {
  sections: CustomizeSection[];
  equips: Record<string, string | null>;
  allowed?: boolean;
}

/** Who the preview is: the profile Edit profile has already read. */
export interface WardrobeOwner {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  /** The older avatar frame, drawn as the profile draws it. */
  frame: string | null;
  /** A card of theirs to dress in the Showcase preview, if they have one. */
  cardImage: string | null;
}

/** Scenes and backgrounds are wide panels: two to a row, not three. */
const WIDE: ReadonlySet<CustomizeKind> = new Set(["scene", "background"]);

/**
 * The Look and Showcase tabs of Edit profile: everything you own in one
 * category at a time, worn with a tap.
 *
 * It was its own screen, every category stacked down one long list -
 * the founder: "take a look at the customize your look screen. it's just
 * a long scrolling list of different types of cosmetics", then "build
 * it go" on the plan:
 *
 * - A LIVE PREVIEW pinned on top: you, or one of your cards, wearing
 *   what is picked, so a choice is seen before it is left.
 * - CHIPS for the categories: one category on screen, not ten.
 * - A GRID, art first, three across (two for the wide panels).
 * - WHAT YOU OWN, then "More in the Embers shop": buying stays in the
 *   shop, which is the one place that sells.
 * - "None" first, to take a category off.
 *
 * The website's hub draws the same (components/players/customize-hub).
 */
export function Wardrobe({
  area,
  owner,
  draft,
  onPick,
}: {
  area: "profile" | "showcase";
  owner: WardrobeOwner;
  /** What is picked and not yet saved; Edit profile's Done saves it. */
  draft: LookDraft;
  /** A tile tapped: staged, not written. The art rides along for a
      dropped-in ring or aura, which the profile draws from a file. */
  onPick: (kind: CustomizeKind, slug: string | null, art: ArtFile | null) => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const { width: screen } = useWindowDimensions();
  const [sections, setSections] = useState<CustomizeSection[] | null>(null);
  /* The worn slug per kind, as the server last said. A tap does not
     change it: picks are staged in `draft` until Done. */
  const [saved, setSaved] = useState<Record<string, string | null>>({});
  /* A look Done is still saving shows as worn here too. */
  const { pending } = usePendingLook();
  /* Whether this tier may WEAR any of it; the server refuses with
     "not-pro" if this optimism was wrong. */
  const [allowed, setAllowed] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [kind, setKind] = useState<CustomizeKind>(AREA_KINDS[area][0]);

  const sectionsRef = useRef<CustomizeSection[] | null>(null);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);
  useEffect(() => {
    setKind(AREA_KINDS[area][0]);
  }, [area]);

  const load = useCallback(async () => {
    try {
      const result = await getCustomize();
      setSections(result.sections);
      setSaved(result.equips);
      setAllowed(result.customizationAllowed ?? true);
      setMessage(null);
      const id = await cachedPlayerId();
      if (id)
        void writeCache("customize", id, {
          sections: result.sections,
          equips: result.equips,
          allowed: result.customizationAllowed ?? true,
        } satisfies CachedWardrobe);
    } catch {
      if (!sectionsRef.current) {
        setMessage("Could not load your wardrobe. Go back and try again.");
      }
    }
  }, []);

  /* Last visit's wardrobe, painted before this one has loaded. */
  useEffect(() => {
    let live = true;
    void (async () => {
      const id = await cachedPlayerId();
      if (!id || !live) return;
      const cached = await readCache<CachedWardrobe>("customize", id);
      if (!cached || !live || sectionsRef.current) return;
      setSections(cached.sections);
      setSaved(cached.equips);
      setAllowed(cached.allowed ?? true);
    })();
    return () => {
      live = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const wear = (on: CustomizeKind, slug: string | null) => {
    /* Wearing is Pro; taking something OFF stays free. */
    if (!allowed && slug !== null) {
      navigation.navigate("Pro");
      return;
    }
    const art =
      sections?.find((entry) => entry.kind === on)?.items.find((item) => item.slug === slug)
        ?.art ?? null;
    onPick(on, slug, art);
  };

  /* What the preview and the ticks show: saved, then saving, then picked. */
  const worn: Record<string, string | null> = {
    ...saved,
    ...(pending?.equips ?? {}),
    ...draft,
  };

  if (!sections) {
    return (
      <View style={{ padding: spacing(6) }}>
        {message ? <Muted>{message}</Muted> : <ActivityIndicator color={colors.accent} />}
      </View>
    );
  }

  const shown = sections.filter((section) => AREA_KINDS[area].includes(section.kind));
  const section = shown.find((entry) => entry.kind === kind) ?? shown[0];
  const owned = section ? section.items.filter((item) => item.owned) : [];
  const columns = section && WIDE.has(section.kind) ? 2 : 3;
  const gap = spacing(2);
  const tileWidth = Math.floor((screen - gutter * 2 - gap * (columns - 1)) / columns);
  const current = section ? (worn[section.kind] ?? null) : null;
  /* A dropped-in ring or aura is a file, not a slug the avatar knows:
     hand the preview the worn item's art, as the profile does. */
  const artOf = (on: CustomizeKind) =>
    sections
      ?.find((entry) => entry.kind === on)
      ?.items.find((item) => item.slug === worn[on])?.art ?? null;

  return (
    <View style={{ gap: spacing(4) }}>
      {/* THE PREVIEW: what you are wearing, as it will be seen. */}
      <Card style={{ alignItems: "center", gap: spacing(2), paddingVertical: spacing(5) }}>
        {area === "profile" ? (
          <>
            <PlayerAvatar
              displayName={owner.displayName}
              seed={owner.playerId}
              avatarUrl={owner.avatarUrl}
              frame={owner.frame}
              ring={worn.ring ?? null}
              aura={worn.aura ?? null}
              ringArt={artOf("ring")}
              auraArt={artOf("aura")}
              size={88}
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}>
              <WornName
                name={owner.displayName}
                nameplate={worn.nameplate ?? null}
                fontSize={20}
                baseStyle={{ fontSize: 20, fontWeight: "800", color: colors.textPrimary }}
              />
              <WornBadge badge={worn.badge ?? null} />
            </View>
            <WornTitle title={worn.title ?? null} />
          </>
        ) : (
          <View
            style={{
              width: 200,
              height: 170,
              borderRadius: radius.control,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.canvas,
            }}
          >
            {worn.background && drawsBackground(worn.background) ? (
              <View style={{ position: "absolute", left: 0, top: 0 }}>
                <WornBackground background={worn.background} width={200} height={170} radius={0} />
              </View>
            ) : null}
            <CosmeticCard
              imageUrl={owner.cardImage}
              width={100}
              frame={null}
              holo={null}
              effect={null}
              border={worn.border ?? null}
              pattern={worn.pattern ?? null}
              animation={worn.animation ?? null}
            />
          </View>
        )}
      </Card>

      {/* Honest before anything is tapped: browsing is free, wearing is Pro. */}
      {!allowed && (
        <Tap
          onPress={() => navigation.navigate("Pro")}
          accessibilityLabel="Get cardflare Pro"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(2),
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: colors.accent,
            backgroundColor: colors.accentTint,
            padding: spacing(3),
          }}
        >
          <Ionicons name="sparkles" size={16} color={colors.accent} />
          <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700", flex: 1 }}>
            Wearing cosmetics is a cardflare <ProMark size={13} /> feature. Tap to get{" "}
            <ProMark size={13} />.
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.accent} />
        </Tap>
      )}

      {/* THE CHIPS: one category at a time. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing(2) }}
      >
        {shown.map((entry) => {
          const on = entry.kind === section?.kind;
          return (
            <Tap
              key={entry.kind}
              onPress={() => setKind(entry.kind)}
              accessibilityLabel={SECTION_COPY[entry.kind].title}
              accessibilityState={{ selected: on }}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: on ? colors.accent : colors.border,
                backgroundColor: on ? colors.accentTint : colors.elevated,
                paddingHorizontal: spacing(3.5),
                paddingVertical: spacing(2),
              }}
            >
              <Text
                style={{
                  color: on ? colors.accent : colors.textSecondary,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                {SECTION_COPY[entry.kind].title}
              </Text>
            </Tap>
          );
        })}
      </ScrollView>

      {message && <Muted>{message}</Muted>}

      {section ? (
        <View style={{ gap: spacing(3) }}>
          <Muted>{SECTION_COPY[section.kind].blurb}</Muted>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
            {/* None first: take this category off. */}
            <WardrobeTile
              width={tileWidth}
              label="None"
              on={current === null}
              onPress={() => wear(section.kind, null)}
            >
              <Ionicons name="ban-outline" size={28} color={colors.textMuted} />
            </WardrobeTile>
            {owned.map((item) => (
              <WardrobeTile
                key={item.slug}
                width={tileWidth}
                label={item.name}
                on={current === item.slug}
                onPress={() =>
                  wear(section.kind, current === item.slug ? null : item.slug)
                }
              >
                {/* A dropped-in file draws itself, as on the website's
                    tiles; the catalogue draws from its CSS. */}
                {item.art ? (
                  <CosmeticFilm art={item.art} size={PREVIEW * 1.5} />
                ) : (
                  <CosmeticPreview kind={section.kind} slug={item.slug} />
                )}
              </WardrobeTile>
            ))}
          </View>
          {owned.length === 0 ? (
            <Muted>Nothing here yet. Find some in the Embers shop.</Muted>
          ) : null}
          {/* Buying stays in the shop: this is the door to it. */}
          <Tap
            onPress={() => navigation.navigate("Store")}
            accessibilityLabel="More in the Embers shop"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing(2),
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.elevated,
              padding: spacing(3),
            }}
          >
            <Ionicons name="storefront-outline" size={18} color={colors.accent} />
            <Text
              style={{ flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: "600" }}
            >
              More in the Embers shop
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Tap>
        </View>
      ) : null}
    </View>
  );
}

/** One square in the wardrobe: the art, the name, a ring when worn. */
function WardrobeTile({
  width,
  label,
  on,
  onPress,
  children,
}: {
  width: number;
  label: string;
  on: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={on ? `${label}, wearing` : label}
      accessibilityState={{ selected: on }}
      style={{
        width,
        minHeight: 104,
        alignItems: "center",
        justifyContent: "center",
        gap: spacing(2),
        borderRadius: radius.control,
        borderWidth: on ? 2 : 1,
        borderColor: on ? colors.accent : colors.border,
        backgroundColor: on ? colors.accentTint : colors.elevated,
        padding: spacing(2),
      }}
    >
      <View style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}>
        {children}
      </View>
      <Text
        numberOfLines={2}
        style={{
          color: on ? colors.textPrimary : colors.textSecondary,
          fontSize: 12,
          fontWeight: on ? "700" : "500",
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Tap>
  );
}
