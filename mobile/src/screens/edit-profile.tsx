import { Ionicons } from "@expo/vector-icons";
import { useNavigation, usePreventRemove } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import {
  friendlyError,
  getProfile,
  type CustomizeKind,
  type Profile,
  renameProfile,
  setAbout,
  setHandle,
} from "../api";
import {
  changeAnimatedPicture,
  pickPicture,
  uploadPicture,
  type PickedPicture,
  type PictureKind,
  type PictureReporter,
} from "../change-picture";
import type { ArtFile } from "../cosmetic-film";
import { CropSheet, type CropSubject } from "../crop-picture";
import { HeaderTextButton } from "../header";
import {
  saveLook,
  usePendingLook,
  wearPending,
  type LookArt,
  type LookDraft,
} from "../look-save";
import { Wardrobe } from "./customize";
import { HANDLE_MAX, HANDLE_MIN, handleWhileTyping } from "../handle";
import { PlayerAvatar } from "../player-avatar";
import { ProMark } from "../pro-mark";
import { colors, gutter, spacing } from "../theme";
import {
  Body,
  Button,
  Card,
  HandleInput,
  Input,
  Loading,
  Muted,
  Tap,
  Title,
} from "../ui";

/**
 * Edit profile, laid out the way Instagram lays it out.
 *
 * The founder: "match the edit profile screen to this. Add bio,
 * pronouns, username editing, name changing, into a menu that looks
 * like this. The avatar effects should also be here." So: the picture
 * beside a second circle for the effects, one link under them for
 * changing the picture, then four rows, label left in the muted colour
 * and value right, a hairline apart. Tapping a row opens it to edit.
 * The website's /profile/edit is the same screen in the same words.
 *
 * Every write goes to the endpoint the website's forms use, and every
 * refusal is shown with what the server said: a handle can come back
 * taken, and "try again" would not help with that.
 */

/** The bio's ceiling, the server's `players_bio_length`. */
export const BIO_MAX = 150;
/** How many lines a bio may run to, the server's rule as well. */
export const BIO_LINES = 4;
/** The pronouns' ceiling, the server's `players_pronouns_length`. */
export const PRONOUNS_MAX = 20;
/** The name's ceiling, the website's displayNameSchema. */
const NAME_MAX = 40;

/** The size of the picture and of the effects circle beside it. */
const CIRCLE = 88;

type Row = "name" | "username" | "pronouns" | "bio";

/** The screen's three tabs: who you are, and what you and your cards wear. */
export type EditTab = "profile" | "look" | "showcase";

const TABS: { key: EditTab; label: string }[] = [
  { key: "profile", label: "Profile" },
  { key: "look", label: "Look" },
  { key: "showcase", label: "Showcase" },
];

/**
 * Edit profile and Customize, one screen. The founder: "move the edit
 * profile button into the wand, they do the exact same thing basically.
 * like combine them", then "build it go" on three tabs - Profile (the
 * picture, name, username, pronouns and bio), Look (what you wear) and
 * Showcase (what your cards wear). The wand opens it; so does your
 * picture; the old Customize route lands on its tab.
 */
export function EditProfileScreen({ initialTab = "profile" }: { initialTab?: EditTab }) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [tab, setTab] = useState<EditTab>(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadFailed, setLoadFailed] = useState<string | null>(null);

  /* The picture controls, folded behind their one link. */
  const [pictureOpen, setPictureOpen] = useState(false);
  const [busy, setBusy] = useState<PictureKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /* The picture being cropped, between the picker and the upload. */
  const [cropping, setCropping] = useState<CropSubject | null>(null);

  /* The row that is open for editing, or none. One at a time, the way
     Instagram opens one field per screen. */
  const [open, setOpen] = useState<Row | null>(null);

  /*
   * What the Look and Showcase tabs have picked and not saved. The
   * founder: "i think we need a 'done' button... the second i press done
   * or whatever, it updates on my account and the server stuff happens
   * in the background. if it doesn't save, it'll just revert back." A
   * tap stages; Done hands the lot to saveLook (look-save.ts) and
   * leaves, and the profile wears it at once. Back with picks unsaved
   * asks first, so nothing is lost by a slip.
   */
  const { pending } = usePendingLook();
  const [draft, setDraft] = useState<LookDraft>({});
  const [draftArt, setDraftArt] = useState<LookArt>({});
  const dirty = Object.keys(draft).length > 0;
  const leaving = useRef(false);

  const pick = (kind: CustomizeKind, slug: string | null, art: ArtFile | null) => {
    const was = (profile ? wearPending(profile, pending).equips?.[kind] : null) ?? null;
    setDraft((current) => {
      const next = { ...current };
      if (slug === was) delete next[kind];
      else next[kind] = slug;
      return next;
    });
    if (kind === "ring") setDraftArt((current) => ({ ...current, ringArt: art }));
    if (kind === "aura") setDraftArt((current) => ({ ...current, auraArt: art }));
  };

  const done = () => {
    leaving.current = true;
    if (dirty) void saveLook(draft, draftArt);
    navigation.goBack();
  };

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => <HeaderTextButton label="Done" onPress={done} />,
    });
    /* done reads draft and draftArt: set again whenever they change. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, draft, draftArt]);

  usePreventRemove(dirty, ({ data }) => {
    if (leaving.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert("Discard your changes?", "What you picked has not been saved. Tap Done to keep it.", [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  const load = async () => {
    try {
      const result = await getProfile();
      setProfile(result.profile);
      setLoadFailed(null);
    } catch (caught) {
      setLoadFailed(friendlyError(caught));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (!profile && loadFailed) {
    return (
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
        }}
      >
        <Card>
          <Title>Your profile could not load</Title>
          <Body>Check your signal and try again.</Body>
          <Muted>{loadFailed}</Muted>
          <Button label="Try again" variant="secondary" onPress={() => void load()} />
        </Card>
      </ScrollView>
    );
  }

  if (!profile) {
    return <Loading />;
  }

  const reporter: PictureReporter = { say: setMessage, busy: setBusy };

  /* The picture wears what is saving and what is picked, as Done will. */
  const shown = wearPending(
    wearPending(profile, pending),
    dirty ? { equips: draft, ...draftArt } : null,
  );

  /* A new picture is on the server: read the profile back so the
     circle at the top shows it. The profile tab re-reads on focus. */
  const picture = async (kind: PictureKind) => {
    const picked = await pickPicture(reporter);
    if (!picked) return;
    setCropping({
      kind,
      ...picked,
      displayName: profile.displayName,
      handle: profile.handle,
      avatarUrl: profile.avatarUrl,
      coverUrl: profile.coverUrl,
    });
  };
  const cropped = async (
    subject: CropSubject,
    crop: Parameters<typeof uploadPicture>[2],
  ) => {
    setCropping(null);
    const picked: PickedPicture = {
      uri: subject.uri,
      width: subject.width,
      height: subject.height,
    };
    if (await uploadPicture(subject.kind, picked, crop, reporter)) await load();
  };
  const animated = async () => {
    if (await changeAnimatedPicture(reporter)) await load();
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingVertical: spacing(4),
        gap: spacing(4),
      }}
    >
      {/* The tabs. */}
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: "row",
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.elevated,
          padding: 3,
        }}
      >
        {TABS.map((entry) => {
          const on = entry.key === tab;
          return (
            <Tap
              key={entry.key}
              onPress={() => setTab(entry.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: spacing(2),
                borderRadius: 999,
                backgroundColor: on ? colors.accent : "transparent",
              }}
            >
              <Text
                style={{
                  color: on ? colors.accentContrast : colors.textSecondary,
                  fontSize: 14,
                  fontWeight: "700",
                }}
              >
                {entry.label}
              </Text>
            </Tap>
          );
        })}
      </View>

      {tab !== "profile" ? (
        <Wardrobe
          area={tab === "look" ? "profile" : "showcase"}
          owner={{
            playerId: profile.playerId,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            frame: profile.equipped.avatarFrame,
            cardImage: profile.showcase[0]?.imageUrl ?? null,
          }}
          draft={draft}
          onPick={pick}
        />
      ) : (
      <>
      <Card>
        {/* The picture as the profile shows it, and beside it the door
            to the Look tab: ring, aura, the lot. */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: spacing(6),
            paddingTop: spacing(2),
          }}
        >
          <PlayerAvatar
            displayName={profile.displayName}
            seed={profile.playerId}
            avatarUrl={profile.avatarUrl}
            frame={profile.equipped.avatarFrame}
            ring={shown.wear?.ring ?? null}
            aura={shown.wear?.aura ?? null}
            ringArt={shown.wear?.ringArt ?? null}
            auraArt={shown.wear?.auraArt ?? null}
            size={CIRCLE}
          />
          <Tap
            onPress={() => setTab("look")}
            accessibilityLabel="Avatar effects"
            style={{
              width: CIRCLE,
              height: CIRCLE,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.elevated,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="color-wand" size={32} color={colors.textSecondary} />
          </Tap>
        </View>

        {/* One link, the way Instagram has one. It reveals the picture
            and cover buttons rather than opening the picker straight
            away, because there are two pictures and a GIF to choose
            between. */}
        <Tap
          onPress={() => setPictureOpen((was) => !was)}
          accessibilityLabel="Edit picture or avatar"
          style={{ alignSelf: "center", paddingVertical: spacing(1) }}
        >
          <Text style={{ color: colors.accent, fontWeight: "600", fontSize: 14 }}>
            Edit picture or avatar
          </Text>
        </Tap>

        {(pictureOpen || busy !== null) && (
          <View style={{ gap: spacing(2) }}>
            <View style={{ flexDirection: "row", gap: spacing(2) }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={busy === "avatar" ? "Uploading…" : "Change picture"}
                  variant="secondary"
                  busy={busy === "avatar"}
                  disabled={busy !== null}
                  onPress={() => void picture("avatar")}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={busy === "cover" ? "Uploading…" : "Change cover"}
                  variant="secondary"
                  busy={busy === "cover"}
                  disabled={busy !== null}
                  onPress={() => void picture("cover")}
                />
              </View>
            </View>
            {/*
             * Offered to everybody rather than hidden behind the tier.
             * A button that says what it is teaches the feature
             * exists; for a free account it opens the paywall instead
             * of walking them through picking a GIF that then bounces.
             */}
            <Button
              label="Use a GIF"
              mark={<ProMark size={15} />}
              variant="secondary"
              disabled={busy !== null}
              onPress={() =>
                profile.pro ? void animated() : navigation.navigate("Pro")
              }
            />
          </View>
        )}
        {message && busy === null ? <Muted>{message}</Muted> : null}
      </Card>

      {/* The crop, with the profile drawn under it, between the picker
          and the upload. */}
      <CropSheet
        subject={cropping}
        onCancel={() => setCropping(null)}
        onDone={(crop) => {
          if (cropping) void cropped(cropping, crop);
        }}
      />

      {/* The four rows. Label left, value right, a hairline between;
          tap one and it opens into its field and a Save. */}
      <Card style={{ gap: 0, paddingVertical: spacing(1) }}>
        <EditableRow
          label="Name"
          value={profile.displayName}
          placeholder="Add a name"
          open={open === "name"}
          onToggle={() => setOpen(open === "name" ? null : "name")}
          first
          canSave={(value) =>
            value.trim().length > 0 && value.trim() !== profile.displayName
          }
          onSave={async (value) => {
            await renameProfile(value.trim());
            setProfile({ ...profile, displayName: value.trim() });
          }}
          input={(value, onChange) => (
            <Input
              value={value}
              onChangeText={onChange}
              maxLength={NAME_MAX}
              autoCapitalize="words"
              placeholder="What people call you"
              autoFocus
            />
          )}
        />
        <EditableRow
          label="Username"
          value={profile.handle}
          placeholder="Add a username"
          open={open === "username"}
          onToggle={() => setOpen(open === "username" ? null : "username")}
          canSave={(value) =>
            value.trim().length >= HANDLE_MIN && value.trim() !== profile.handle
          }
          onSave={async (value) => {
            const result = await setHandle(value.trim());
            setProfile({ ...profile, handle: result.handle ?? value.trim() });
          }}
          input={(value, onChange) => (
            <HandleInput
              value={value}
              /* The TYPING shaper, so an underscore can actually be
                 typed: the stored-handle one strips it the moment it
                 lands. */
              onChangeText={(next) => onChange(handleWhileTyping(next))}
              maxLength={HANDLE_MAX}
              placeholder="your_handle"
              autoFocus
            />
          )}
          hint="Letters, numbers and underscores. Yours alone."
        />
        <EditableRow
          label="Pronouns"
          value={profile.pronouns ?? ""}
          placeholder="Add pronouns"
          open={open === "pronouns"}
          onToggle={() => setOpen(open === "pronouns" ? null : "pronouns")}
          /* An emptied field is a real save: it clears them. */
          canSave={(value) => value.trim() !== (profile.pronouns ?? "")}
          onSave={async (value) => {
            const result = await setAbout({
              pronouns: value.trim(),
              bio: profile.bio ?? "",
            });
            setProfile({ ...profile, pronouns: result.pronouns, bio: result.bio });
          }}
          input={(value, onChange) => (
            <Input
              value={value}
              onChangeText={onChange}
              maxLength={PRONOUNS_MAX}
              autoCapitalize="none"
              placeholder="he/him"
              autoFocus
            />
          )}
        />
        <EditableRow
          label="Bio"
          value={profile.bio ?? ""}
          placeholder="Add a bio"
          open={open === "bio"}
          onToggle={() => setOpen(open === "bio" ? null : "bio")}
          multiline
          canSave={(value) =>
            value.trim() !== (profile.bio ?? "") && lineCount(value) <= BIO_LINES
          }
          onSave={async (value) => {
            const result = await setAbout({
              pronouns: profile.pronouns ?? "",
              bio: value,
            });
            setProfile({ ...profile, pronouns: result.pronouns, bio: result.bio });
          }}
          input={(value, onChange) => (
            <Input
              value={value}
              onChangeText={onChange}
              maxLength={BIO_MAX}
              multiline
              placeholder="A line or two about you"
              style={{ minHeight: 88, textAlignVertical: "top" }}
              autoFocus
            />
          )}
          hintFor={(value) =>
            lineCount(value) > BIO_LINES
              ? `Keep the bio to ${BIO_LINES} lines.`
              : `${value.length} of ${BIO_MAX}`
          }
        />
      </Card>
      </>
      )}
    </ScrollView>
  );
}

/** How many lines a bio runs to, counted the way the server counts. */
function lineCount(value: string): number {
  return value.replace(/\r\n?/g, "\n").trim().split("\n").length;
}

/**
 * One row of the list: the label and the value, or, open, the label
 * over its field and a Save. The field's shape is the caller's; the
 * row owns the busy state and what the server said when it refused.
 */
function EditableRow({
  label,
  value,
  placeholder,
  open,
  onToggle,
  first = false,
  multiline = false,
  canSave,
  onSave,
  input,
  hint,
  hintFor,
}: {
  label: string;
  /** The saved value; empty when there is none yet. */
  value: string;
  /** What the row shows, muted, when the value is empty. */
  placeholder: string;
  open: boolean;
  onToggle: () => void;
  first?: boolean;
  multiline?: boolean;
  canSave: (draft: string) => boolean;
  /** Resolves once the server has it; throws with what it said otherwise. */
  onSave: (draft: string) => Promise<void>;
  input: (draft: string, onChange: (next: string) => void) => ReactNode;
  /** A line under the field, always. */
  hint?: string;
  /** A line under the field that depends on what is typed. */
  hintFor?: (draft: string) => string;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* A fresh open starts from what is saved, not from a draft left
     behind when the row was last closed. */
  useEffect(() => {
    if (open) {
      setDraft(value);
      setError(null);
    }
  }, [open, value]);

  return (
    <View
      style={{
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
        paddingVertical: spacing(3),
        gap: spacing(2),
      }}
    >
      <Tap
        onPress={onToggle}
        accessibilityLabel={`Edit ${label.toLowerCase()}`}
        style={{
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          gap: spacing(3),
        }}
      >
        <Text
          style={{
            width: 96,
            color: colors.textMuted,
            fontSize: 15,
            lineHeight: 20,
          }}
        >
          {label}
        </Text>
        <Text
          numberOfLines={multiline ? BIO_LINES : 1}
          style={{
            flex: 1,
            minWidth: 0,
            color: value ? colors.textPrimary : colors.textMuted,
            fontSize: 15,
            lineHeight: 20,
          }}
        >
          {value || placeholder}
        </Text>
      </Tap>

      {open ? (
        <View style={{ gap: spacing(2) }}>
          {input(draft, (next) => {
            setDraft(next);
            setError(null);
          })}
          {hintFor ? (
            <Muted>{hintFor(draft)}</Muted>
          ) : hint ? (
            <Muted>{hint}</Muted>
          ) : null}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              gap: spacing(2),
            }}
          >
            <View style={{ flex: 1 }}>
              <Button label="Cancel" variant="secondary" onPress={onToggle} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Save"
                busy={saving}
                disabled={saving || !canSave(draft)}
                onPress={() => {
                  setSaving(true);
                  setError(null);
                  onSave(draft)
                    .then(onToggle)
                    .catch((caught: unknown) => {
                      setError(`Could not save that. ${friendlyError(caught)}`);
                    })
                    .finally(() => setSaving(false));
                }}
              />
            </View>
          </View>
          {error ? (
            <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
