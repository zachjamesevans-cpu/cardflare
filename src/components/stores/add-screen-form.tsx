import { Plus } from "lucide-react";

import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/controls";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Naming a television is one field.
 *
 * One form for every place a screen gets added: the setup wizard posts
 * its own wrapper (which repaints the wizard), and FlareCast's page can
 * post `createDisplayAction` straight. The `action` is whichever door
 * the page wants; the field is the same, so a screen is named the same
 * way wherever it is named.
 */
export function AddScreenForm({
  storeId,
  first,
  action,
}: {
  storeId: string;
  /** Whether this is the store's first screen; changes the words. */
  first: boolean;
  /** The Server Action the form posts. It reads `storeId` and `name`. */
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <Card className="flex flex-col gap-3 border-dashed">
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="storeId" value={storeId} />
        <label
          htmlFor="new-screen-name"
          className="flex items-center gap-2 font-semibold text-text-primary"
        >
          <Plus className="size-4 text-accent" aria-hidden="true" />
          {first ? "Name your first screen" : "Add another screen"}
        </label>
        <TextInput
          id="new-screen-name"
          name="name"
          maxLength={40}
          placeholder={first ? "Main TV" : "Back TV"}
        />
        <div>
          <SubmitButton label="Add the screen" pendingLabel="Adding…" size="sm" />
        </div>
      </form>
    </Card>
  );
}
