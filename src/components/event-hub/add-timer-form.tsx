"use client";

import { useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Checkbox, Select, TextInput } from "@/components/ui/controls";
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
  const [autoMode, setAutoMode] = useState(false);
  const [intermissionChoice, setIntermissionChoice] = useState("3");

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
          {/* No default. Pre-filling it with the game's own name meant
              every panel read "One Piece" above "One Piece Card Game",
              and a field that already looks answered is a field nobody
              corrects. */}
          <TextInput
            id="eventName"
            name="eventName"
            required
            maxLength={EVENT_NAME_MAX}
            placeholder="Friday Night Locals"
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

      {/* The wall's default answer to time is the clock alone, red and
          counting up. This is the opt-in for the full procedure card —
          the founder: "a 'beginner' mode toggle which does show the
          rules for people if it goes to time." */}
      <Checkbox
        id={`show-rules-${displayId}`}
        name="showRules"
        label="Show the rules on screen when time is called (beginner mode)"
      />

      {/* Auto Mode: the other opt-in. Off is exactly today's behaviour;
          on means the round runs itself into an intermission at time
          and starts the next one when the countdown hits zero. */}
      <Checkbox
        id={`auto-mode-${displayId}`}
        name="autoMode"
        checked={autoMode}
        onChange={(event) => setAutoMode(event.target.checked)}
        label="Auto Mode: run the next round automatically after a break"
      />

      {autoMode && (
        <div className="grid gap-4 rounded-[var(--radius-control)] border border-border bg-elevated p-3 sm:grid-cols-2">
          <Field
            label="Break between rounds"
            htmlFor={`intermission-${displayId}`}
            hint="Time for you to enter results and post pairings. The display counts it down."
          >
            <Select
              id={`intermission-${displayId}`}
              name="intermissionChoice"
              value={intermissionChoice}
              onChange={(event) => setIntermissionChoice(event.target.value)}
            >
              <option value="2">2 minutes</option>
              <option value="3">3 minutes (recommended)</option>
              <option value="5">5 minutes</option>
              <option value="custom">Custom</option>
            </Select>
          </Field>

          {intermissionChoice === "custom" && (
            <Field
              label="Custom break (minutes)"
              htmlFor={`intermission-custom-${displayId}`}
            >
              <TextInput
                id={`intermission-custom-${displayId}`}
                name="intermissionCustom"
                type="number"
                min={1}
                max={60}
                placeholder="4"
              />
            </Field>
          )}

          <div className="sm:col-span-2">
            <input type="hidden" name="autoStart" value="off" />
            <Checkbox
              id={`auto-start-${displayId}`}
              name="autoStart"
              value="on"
              defaultChecked
              label="Start the next round automatically at zero. Unticked, the display waits for you at zero instead."
            />
          </div>
        </div>
      )}

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
