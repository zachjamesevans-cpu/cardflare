"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { TextInput, Textarea } from "@/components/ui/controls";
import { Field, fieldIds } from "@/components/ui/field";
import { updateStorePageAction } from "@/lib/stores/page-actions";
import {
  STORE_ADDRESS_MAX,
  STORE_DESCRIPTION_MAX,
  STORE_NAME_MAX,
  STORE_PAGE_IDLE,
  STORE_PHONE_MAX,
  STORE_PLACE_MAX,
  STORE_WEBSITE_MAX,
  type StorePageFields,
  type StorePageState,
} from "@/lib/stores/page-schema";

/**
 * The store's own page, editable.
 *
 * One form, every public field, one Save. A client component only
 * because `useActionState` is how the server's validation message gets
 * back to the person who typed the thing it rejected; the caps on the
 * inputs are a convenience and the schema is the rule.
 */
export function StorePageForm({ page }: { page: StorePageFields }) {
  const [state, action] = useActionState<StorePageState, FormData>(
    updateStorePageAction,
    STORE_PAGE_IDLE,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="storeId" value={page.storeId} />

      <Field name="name" label="Store name">
        <TextInput
          {...fieldIds("name")}
          name="name"
          defaultValue={page.name}
          maxLength={STORE_NAME_MAX}
          required
          autoComplete="organization"
        />
      </Field>

      <Field
        name="description"
        label="About the shop"
        optional
        hint={`A line or two, up to ${STORE_DESCRIPTION_MAX} characters. What you run, what you stock, when the regulars turn up.`}
      >
        <Textarea
          {...fieldIds("description")}
          name="description"
          defaultValue={page.description ?? ""}
          maxLength={STORE_DESCRIPTION_MAX}
          rows={3}
        />
      </Field>

      <Field name="addressLine" label="Street address" optional>
        <TextInput
          {...fieldIds("addressLine")}
          name="addressLine"
          defaultValue={page.addressLine ?? ""}
          maxLength={STORE_ADDRESS_MAX}
          autoComplete="street-address"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="city" label="City" optional>
          <TextInput
            {...fieldIds("city")}
            name="city"
            defaultValue={page.city ?? ""}
            maxLength={STORE_PLACE_MAX}
            autoComplete="address-level2"
          />
        </Field>
        <Field name="region" label="State" optional>
          <TextInput
            {...fieldIds("region")}
            name="region"
            defaultValue={page.region ?? ""}
            maxLength={STORE_PLACE_MAX}
            autoComplete="address-level1"
          />
        </Field>
        <Field name="postalCode" label="ZIP" optional>
          <TextInput
            {...fieldIds("postalCode")}
            name="postalCode"
            defaultValue={page.postalCode ?? ""}
            inputMode="numeric"
            maxLength={10}
            autoComplete="postal-code"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="phone" label="Phone" optional>
          <TextInput
            {...fieldIds("phone")}
            name="phone"
            type="tel"
            defaultValue={page.phone ?? ""}
            maxLength={STORE_PHONE_MAX}
            autoComplete="tel"
          />
        </Field>
        <Field name="website" label="Website" optional hint="Starting with https://">
          <TextInput
            {...fieldIds("website")}
            name="website"
            type="url"
            defaultValue={page.website ?? ""}
            maxLength={STORE_WEBSITE_MAX}
            placeholder="https://"
            autoComplete="url"
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Save your page" pendingLabel="Saving…" variant="primary" />
        {state.status !== "idle" && (
          <p
            role="status"
            className={`text-sm ${
              state.status === "error" ? "text-danger" : "text-success"
            }`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
