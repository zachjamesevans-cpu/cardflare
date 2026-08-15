import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import {
  getCustomize,
  setCustomizeEquip,
  type CustomizeKind,
  type CustomizeSection,
} from "../api";
import { Card, Muted, Tap } from "../ui";
import { colors, radius, spacing } from "../theme";

/**
 * Getting dressed, in one place — the same hub the website has at
 * /profile/customize: every category, everything you own, tap to wear
 * it, tap again to take it off. Same sections, same wording, same
 * badges, per the parity rule.
 *
 * One honest difference, said on screen rather than papered over: the
 * new categories' art is drawn on the web profile today. Wearing
 * something here equips it everywhere — the tile just cannot show the
 * animation yet. The per-category native art pass is next.
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

export function CustomizeScreen({ area }: { area: "profile" | "showcase" }) {
  const [sections, setSections] = useState<CustomizeSection[] | null>(null);
  /* The worn slug per kind, flipped locally the moment a tile is
     tapped so the tick never waits on the network — same optimistic
     shape as the website's hub. */
  const [worn, setWorn] = useState<Record<string, string | null>>({});
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getCustomize();
      setSections(result.sections);
      setWorn(result.equips);
      setMessage(null);
    } catch {
      setMessage("Could not load your wardrobe. Go back and try again.");
    }
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
        {message ? <Muted>{message}</Muted> : <ActivityIndicator color={colors.accent} />}
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
          These categories are drawn in full on your web profile today. Wearing one
          here equips it everywhere; in-app art for them is coming next.
        </Text>
      </View>

      {message && <Muted>{message}</Muted>}

      {sections
        .filter((section) => AREA_KINDS[area].includes(section.kind))
        .map((section) => (
        <Card key={section.kind} style={{ gap: spacing(3) }}>
          <View style={{ gap: spacing(0.5) }}>
            <Text style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 15 }}>
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
