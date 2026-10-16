"use client";

import { useRouter } from "next/navigation";
import { Store, UserRound, Wand2 } from "lucide-react";

import { DotsMenu } from "@/components/ui/menu";

/**
 * The wand on your own profile: Edit profile, Customize your look, and
 * the Embers shop, the app's three in the app's order.
 *
 * Edit profile was a full-width button under the name. The founder: "we
 * can move the large 'edit profile' button elsewhere. maybe adding it
 * into the wand icon ... it would be nice to have a little more space on
 * this screen considering not everyone is going to use that edit profile
 * button very often." Your picture opens it too. The shop had its own
 * icon beside the wand here; it joins the menu, as on the app.
 */
export function ProfileWandMenu() {
  const router = useRouter();
  return (
    <DotsMenu
      label="Edit profile, customize and Embers shop"
      glyph={<Wand2 className="size-5" aria-hidden="true" />}
      buttonClassName="flex size-10 cursor-pointer items-center justify-center rounded-full border border-border bg-surface/80 text-text-secondary backdrop-blur transition-colors hover:border-border-strong hover:text-text-primary"
      items={[
        {
          key: "edit",
          label: "Edit profile",
          icon: <UserRound className="size-4" aria-hidden="true" />,
          onSelect: () => router.push("/profile/edit"),
        },
        {
          key: "customize",
          label: "Customize your look",
          icon: <Wand2 className="size-4" aria-hidden="true" />,
          onSelect: () => router.push("/profile/customize"),
        },
        {
          key: "store",
          /* No balance here: on the website the spendable number lives
             on the store page and nowhere else (profile/page.tsx). */
          label: "Embers shop",
          icon: <Store className="size-4" aria-hidden="true" />,
          onSelect: () => router.push("/profile/store"),
        },
      ]}
    />
  );
}
