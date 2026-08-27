"use client";

import { Megaphone } from "lucide-react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Checkbox, Select, TextInput } from "@/components/ui/controls";
import { rotateDisplayTokenAction, updateDisplayAction } from "@/lib/event-hub/actions";
import type { LayoutChoice } from "@/lib/event-hub/layout";
import { ANNOUNCEMENT_MAX, NIGHT_TITLE_MAX } from "@/lib/event-hub/schema";

/**
 * What the display says when nothing is running, and how it divides
 * itself when things are.
 *
 * Three small forms rather than one, because they are used at different
 * moments: branding is set once, the announcement changes when the pizza
 * arrives, and the toggles are a Friday-night decision. One big Save
 * would mean a staff member editing the announcement had to think about
 * the layout.
 */
export function DisplaySettings({
  displayId,
  name,
  nightTitle,
  layout,
  announcement,
  showFlares,
  showQr,
  soundEnabled,
}: {
  displayId: string;
  name: string;
  nightTitle: string | null;
  layout: LayoutChoice;
  announcement: string | null;
  showFlares: boolean;
  showQr: boolean;
  soundEnabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <form action={updateDisplayAction} className="flex flex-col gap-3">
        <input type="hidden" name="displayId" value={displayId} />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="announcement"
            className="flex items-center gap-2 text-sm font-medium text-text-secondary"
          >
            <Megaphone className="size-4" aria-hidden="true" />
            Announcement
          </label>
          <TextInput
            id="announcement"
            name="announcement"
            maxLength={ANNOUNCEMENT_MAX}
            defaultValue={announcement ?? ""}
            placeholder="Round 3 pairings are posted."
          />
          <p className="text-xs text-text-muted">
            One line, across the bottom of the television. Clear the box to remove it.
          </p>
        </div>

        <SubmitButton label="Update announcement" pendingLabel="Updating…" size="sm" />
      </form>

      <form action={updateDisplayAction} className="flex flex-col gap-3">
        <input type="hidden" name="displayId" value={displayId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="screen-name"
              className="text-sm font-medium text-text-secondary"
            >
              Screen name
            </label>
            <TextInput
              id="screen-name"
              name="name"
              maxLength={40}
              defaultValue={name}
              placeholder="Main TV"
            />
            <p className="text-xs text-text-muted">
              What the screens list calls this television.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="nightTitle"
              className="text-sm font-medium text-text-secondary"
            >
              Event night title
            </label>
            <TextInput
              id="nightTitle"
              name="nightTitle"
              maxLength={NIGHT_TITLE_MAX}
              defaultValue={nightTitle ?? ""}
              placeholder="Monday TCG Night"
            />
            <p className="text-xs text-text-muted">Shown beside your store name.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="layout" className="text-sm font-medium text-text-secondary">
              Layout
            </label>
            {/* The founder's names for the three shapes. The stored
                values predate them, so the labels translate. */}
            <Select id="layout" name="layout" defaultValue={layout}>
              <option value="auto">Auto</option>
              <option value="single">Focus (one tournament)</option>
              <option value="split">Split (two)</option>
              <option value="grid">Wallboard (three or four)</option>
            </Select>
            <p className="text-xs text-text-muted">
              Auto picks from what is running. A layout too small for the tournaments on
              it is widened rather than hiding one.
            </p>
          </div>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">What the display shows</legend>

          {/*
           * Each box is preceded by a hidden "off" of the same name.
           * An unticked checkbox posts nothing at all, so without this
           * the action cannot tell "turned it off" from "this form does
           * not carry that field" — and a setting that can be switched
           * on but never off is worse than no setting.
           */}
          <input type="hidden" name="showFlares" value="off" />
          <Checkbox
            id="showFlares"
            name="showFlares"
            value="on"
            defaultChecked={showFlares}
            label="Show the Flare board"
          />

          <input type="hidden" name="showQr" value="off" />
          <Checkbox
            id="showQr"
            name="showQr"
            value="on"
            defaultChecked={showQr}
            label="Show the QR code"
          />

          <input type="hidden" name="soundEnabled" value="off" />
          <Checkbox
            id="soundEnabled"
            name="soundEnabled"
            value="on"
            defaultChecked={soundEnabled}
            label="Sound alerts at 10, 5 and 1 minute, and on time. Browsers block audio until somebody touches the display once."
          />
        </fieldset>

        <SubmitButton label="Save display settings" pendingLabel="Saving…" size="sm" />
      </form>

      <form action={rotateDisplayTokenAction} className="flex flex-col gap-2">
        <input type="hidden" name="displayId" value={displayId} />
        <p className="text-xs text-text-muted">
          {/* Said plainly, because the consequence is immediate. */}
          Issuing a new link stops the old one working straight away. Do this if a
          television leaves the building or the link gets out.
        </p>
        <SubmitButton
          label="Issue a new display link"
          pendingLabel="Issuing…"
          variant="ghost"
          size="sm"
        />
      </form>
    </div>
  );
}
