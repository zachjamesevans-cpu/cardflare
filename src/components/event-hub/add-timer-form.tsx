"use client";

import { useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Select, TextInput } from "@/components/ui/controls";
import { addTimerAction } from "@/lib/event-hub/actions";
import {
  allProfiles,
  GAME_PROFILES,
  procedureFor,
  type Bracket,
  type GameId,
} from "@/lib/event-hub/game-profiles";
import { EVENT_NAME_MAX, FORMAT_MAX } from "@/lib/event-hub/schema";

/**
 * Adding a tournament to the wall.
 *
 * The target the whole feature is measured against: a shop employee
 * replaces a YouTube countdown in under two minutes. So the shortest
 * path through this form is a game, a name and Add — everything else has
 * a defensible default, and the preset already knows the round length.
 */
export function AddTimerForm({ displayId }: { displayId: string }) {
  const [game, setGame] = useState<GameId>("one-piece");
  const [presetId, setPresetId] = useState(GAME_PROFILES["one-piece"].defaultPresetId);
  const [bracket, setBracket] = useState<Bracket>("swiss");

  const profile = GAME_PROFILES[game];
  const preset = profile.presets.find((option) => option.id === presetId);
  const procedure = procedureFor(profile, bracket);

  return (
    <form action={addTimerAction} className="flex flex-col gap-4">
      <input type="hidden" name="displayId" value={displayId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Game" htmlFor="game">
          <Select
            id="game"
            name="game"
            value={game}
            onChange={(event) => {
              const next = event.target.value as GameId;
              setGame(next);
              /* The presets belong to the game, so changing one has to
                 move the other or the form posts a mismatch the server
                 would only reject. */
              setPresetId(GAME_PROFILES[next].defaultPresetId);
            }}
          >
            {allProfiles().map((option) => (
              <option key={option.id} value={option.id}>
                {option.displayName}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Timer preset" htmlFor="presetId" hint={preset?.note}>
          <Select
            id="presetId"
            name="presetId"
            value={presetId}
            onChange={(event) => setPresetId(event.target.value)}
          >
            {profile.presets.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Tournament name" htmlFor="eventName">
          <TextInput
            id="eventName"
            name="eventName"
            required
            maxLength={EVENT_NAME_MAX}
            defaultValue={profile.displayName}
            placeholder="Friday Night One Piece"
          />
        </Field>

        <Field label="Round (optional)" htmlFor="round">
          <TextInput
            id="round"
            name="round"
            type="number"
            min={1}
            max={99}
            placeholder="1"
          />
        </Field>

        <Field label="Format (optional)" htmlFor="format">
          <TextInput
            id="format"
            name="format"
            maxLength={FORMAT_MAX}
            placeholder="Standard"
          />
        </Field>

        <Field
          label="Structure"
          htmlFor="bracket"
          hint={`On time: ${procedure.headline}`}
        >
          <Select
            id="bracket"
            name="bracket"
            value={bracket}
            onChange={(event) => setBracket(event.target.value as Bracket)}
          >
            <option value="swiss">Swiss</option>
            <option value="elimination">Single elimination / top cut</option>
          </Select>
        </Field>

        <Field
          label="Custom length (optional)"
          htmlFor="customMinutes"
          hint="Minutes. Leave blank to use the preset."
        >
          <TextInput
            id="customMinutes"
            name="customMinutes"
            type="number"
            min={1}
            max={480}
            placeholder={
              preset?.durationSeconds === null
                ? "Untimed"
                : preset
                  ? String(Math.round(preset.durationSeconds / 60))
                  : ""
            }
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Add tournament" pendingLabel="Adding…" />
        <a
          href={profile.officialRulesUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-sm font-semibold text-accent hover:underline"
        >
          {profile.displayName} official rules
        </a>
        <span className="text-xs text-text-muted">
          Rules last checked {profile.rulesLastVerified}
        </span>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text-secondary">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
