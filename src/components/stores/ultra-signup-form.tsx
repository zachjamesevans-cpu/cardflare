"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { Field, describedBy, fieldIds } from "@/components/ui/field";
import { PASSWORD_MIN } from "@/lib/auth/signup-schema";
import { startStoreTrialAction } from "@/lib/stores/ultra-actions";
import {
  ULTRA_SIGNUP_IDLE,
  ULTRA_TRIAL_DAYS,
  type UltraSignupState,
} from "@/lib/stores/ultra-schema";

/**
 * The trial form: five fields and one button.
 *
 * A shop owner reads the pitch above this and types here without
 * leaving the page. On submit the account exists, the counter code is
 * minted, and Stripe's page takes over for the card; the console is
 * what they land on after.
 */
export function UltraSignupForm({ sellable }: { sellable: boolean }) {
  const [state, action] = useActionState<UltraSignupState, FormData>(
    startStoreTrialAction,
    ULTRA_SIGNUP_IDLE,
  );
  const values = state.status === "error" ? state.values : {};

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field name="storeName" label="Store name">
        <TextInput
          {...fieldIds("storeName")}
          name="storeName"
          defaultValue={values.storeName ?? ""}
          required
          maxLength={120}
          autoComplete="organization"
          aria-describedby={describedBy("storeName", false, false)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="city" label="City" hint="Optional">
          <TextInput
            {...fieldIds("city")}
            name="city"
            defaultValue={values.city ?? ""}
            maxLength={80}
            autoComplete="address-level2"
            aria-describedby={describedBy("city", false, true)}
          />
        </Field>
        <Field name="region" label="State or region" hint="Optional">
          <TextInput
            {...fieldIds("region")}
            name="region"
            defaultValue={values.region ?? ""}
            maxLength={80}
            autoComplete="address-level1"
            aria-describedby={describedBy("region", false, true)}
          />
        </Field>
      </div>

      <Field name="email" label="Your email">
        <TextInput
          {...fieldIds("email")}
          name="email"
          type="email"
          defaultValue={values.email ?? ""}
          required
          autoComplete="email"
          inputMode="email"
          aria-describedby={describedBy("email", false, false)}
        />
      </Field>

      <Field
        name="password"
        label="Password"
        hint={`At least ${PASSWORD_MIN} characters.`}
      >
        <TextInput
          {...fieldIds("password")}
          name="password"
          type="password"
          required
          minLength={PASSWORD_MIN}
          autoComplete="new-password"
          aria-describedby={describedBy("password", false, true)}
        />
      </Field>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}

      <SubmitButton sellable={sellable} />

      <p className="text-xs leading-relaxed text-text-muted">
        {sellable
          ? `Your card goes on file with Stripe and nothing is charged for ${ULTRA_TRIAL_DAYS} days. Cancel any time from your store console.`
          : "Billing is not switched on yet. Your store is created now and we will sort the subscription out with you."}
      </p>
    </form>
  );
}

function SubmitButton({ sellable }: { sellable: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending
        ? "Setting up your store…"
        : sellable
          ? `Start your ${ULTRA_TRIAL_DAYS}-day free trial`
          : "Create your store account"}
    </Button>
  );
}
