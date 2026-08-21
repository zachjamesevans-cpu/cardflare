import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import {
  getCustomize,
  setCustomizeEquip,
  type CustomizeKind,
  type CustomizeSection,
} from "../api";
import { CosmeticCard } from "../cosmetic-card";
import { cachedPlayerId, readCache, writeCache } from "../cache";
import { drawsBorder } from "../cosmetic-border";
import { WornAura, WornRing } from "../cosmetic-worn";
import { hasAuraArt, hasRingArt } from "../cosmetic-art-data";
import { Card, Muted, Tap } from "../ui";
import { colors, radius, spacing } from "../theme";

/**
 * Getting dressed, in one place — the same hub the website has at
 * /profile/customize: every category, everything you own, tap to wear
 * it, tap again to take it off. Same sections, same wording, same
 * badges, per the parity rule.
 *
 * One honest difference, said on screen rather than papered over: most
 * of the new categories' art is drawn on the web profile today. Wearing
 * something here equips it everywhere — the tile just cannot show the
 * animation yet. The per-category native art pass is working through
 * them, and profile borders and avatar effects are through it.
 *
 * WHICH IS WHY THOSE TWO NOW CARRY A PREVIEW. A picker that lists
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

const AREA_COPY = {
  profile: {
    title: "Customize profile",
    blurb:
      "Everything worn on you: your border, name style, title, badge and page effect. Changes land the moment you tap them.",
  },
  showcase: {
    title: "Customize showcase",
    blurb:
      "Everything worn on your cards: borders, foils, motion and the shelf behind them. Changes land the moment you tap them.",
  },
} as const;

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
function CosmeticPreview({ kind, slug }: { kind: CustomizeKind; slug: string }) {
  /* A card border previews on a card, because that is where it goes. */
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

/** Big enough to read a gradient off, small enough for a list row. */
const PREVIEW = 36;

function Pill({ label, tone }: { label: string; tone: "accent" | "neutral" }) {
  return (
    <View
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: tone === "accent" ? colors.accent : colors.border,
        backgroundColor: tone === "accent" ? "rgba(198,238,79,0.12)" : colors.elevated,
        paddingHorizontal: spacing(2),
        paddingVertical: 2,
      }}
    >
      <Text
        style={{
          color: tone === "accent" ? colors.accent : colors.textSecondary,
          fontSize: 11,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** The wardrobe as it is kept between visits. */
interface CachedWardrobe {
  sections: CustomizeSection[];
  equips: Record<string, string | null>;
}

export function CustomizeScreen({ area }: { area: "profile" | "showcase" }) {
  const [sections, setSections] = useState<CustomizeSection[] | null>(null);
  /* The worn slug per kind, flipped locally the moment a tile is
     tapped so the tick never waits on the network — same optimistic
     shape as the website's hub. */
  const [worn, setWorn] = useState<Record<string, string | null>>({});
  const [message, setMessage] = useState<string | null>(null);

  /* Read inside `load`, whose closure would otherwise hold whatever
     `sections` was at mount. */
  const sectionsRef = useRef<CustomizeSection[] | null>(null);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  const load = useCallback(async () => {
    try {
      const result = await getCustomize();
      setSections(result.sections);
      setWorn(result.equips);
      setMessage(null);

      const id = await cachedPlayerId();
      if (id)
        void writeCache("customize", id, {
          sections: result.sections,
          equips: result.equips,
        } satisfies CachedWardrobe);
    } catch {
      /* Only complain when there is nothing to look at. A wardrobe
         already on screen is better than an error where it used to be. */
      if (!sectionsRef.current) {
        setMessage("Could not load your wardrobe. Go back and try again.");
      }
    }
  }, []);

  /*
   * Last visit's wardrobe, painted before this one has loaded.
   *
   * The heaviest screen in the app and the one that changes least
   * between two visits — what somebody owns moves when they buy
   * something, and buying something reloads this anyway.
   */
  useEffect(() => {
    let live = true;

    void (async () => {
      const id = await cachedPlayerId();
      if (!id || !live) return;

      const cached = await readCache<CachedWardrobe>("customize", id);
      if (!cached || !live || sectionsRef.current) return;

      setSections(cached.sections);
      setWorn(cached.equips);
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

  const wear = (kind: CustomizeKind, slug: string | null) => {
    const before = worn[kind] ?? null;
    setWorn((current) => ({ ...current, [kind]: slug }));
    setCustomizeEquip(kind, slug).catch(() => {
      /* Put it back honestly rather than showing a tick that lied. */
      setWorn((current) => ({ ...current, [kind]: before }));
      setMessage("That change did not save. Check your connection and try again.");
    });
  };

  if (!sections) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, padding: spacing(6) }}>
        {message ? (
          <Muted>{message}</Muted>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}
    >
      <View style={{ gap: spacing(1) }}>
        <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: "700" }}>
          {AREA_COPY[area].title}
        </Text>
        <Muted>{AREA_COPY[area].blurb}</Muted>
      </View>

      {/* The honest note. No fake previews. */}
      <View
        style={{
          flexDirection: "row",
          gap: spacing(2),
          alignItems: "flex-start",
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.elevated,
          padding: spacing(3),
        }}
      >
        <Ionicons name="information-circle" size={16} color={colors.textMuted} />
        <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>
          {area === "profile"
            ? "Profile borders and avatar effects are drawn here now. The rest of these, and any Rive file dropped into them, still draw in full only on your web profile. Wearing one here equips it everywhere."
            : "Card borders are drawn here now. Holo patterns, card animations, showcase backgrounds and any Rive file dropped in still draw in full only on your web profile. Wearing one here equips it everywhere."}
        </Text>
      </View>

      {message && <Muted>{message}</Muted>}

      {sections
        .filter((section) => AREA_KINDS[area].includes(section.kind))
        .map((section) => (
          <Card key={section.kind} style={{ gap: spacing(3) }}>
            <View style={{ gap: spacing(0.5) }}>
              <Text
                style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 15 }}
              >
                {SECTION_COPY[section.kind].title}
              </Text>
              <Muted>
                {SECTION_COPY[section.kind].blurb} Tap to wear it; tap again to take it
                off.
              </Muted>
            </View>

            <View style={{ gap: spacing(2) }}>
              {section.items.map((item) => {
                const on = (worn[section.kind] ?? null) === item.slug;
                return (
                  <Tap
                    key={item.slug}
                    disabled={!item.owned}
                    onPress={() => wear(section.kind, on ? null : item.slug)}
                    accessibilityLabel={
                      on ? `Take off ${item.name}` : `Wear ${item.name}`
                    }
                    style={{
                      borderRadius: radius.control,
                      borderWidth: 1,
                      borderColor: on ? colors.accent : colors.border,
                      backgroundColor: on ? "rgba(198,238,79,0.08)" : colors.elevated,
                      padding: spacing(3),
                      gap: spacing(1),
                      opacity: item.owned ? 1 : 0.45,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing(1.5),
                      }}
                    >
                      <CosmeticPreview kind={section.kind} slug={item.slug} />
                      <Text
                        numberOfLines={1}
                        style={{
                          color: colors.textPrimary,
                          fontWeight: "600",
                          fontSize: 14,
                          flex: 1,
                        }}
                      >
                        {item.name}
                      </Text>
                      {on && (
                        <Ionicons name="checkmark" size={16} color={colors.accent} />
                      )}
                    </View>
                    {item.description ? (
                      <Text
                        numberOfLines={2}
                        style={{ color: colors.textSecondary, fontSize: 12 }}
                      >
                        {item.description}
                      </Text>
                    ) : null}
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: spacing(1.5),
                      }}
                    >
                      {item.status === "draft" && (
                        <Pill label="unreleased" tone="neutral" />
                      )}
                      {!item.owned && <Pill label="not owned yet" tone="neutral" />}
                      {on && <Pill label="wearing" tone="accent" />}
                    </View>
                  </Tap>
                );
              })}
            </View>
          </Card>
        ))}
    </ScrollView>
  );
}
