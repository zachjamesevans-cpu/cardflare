import { redirect } from "next/navigation";

/** The binder's old address, kept for links in the wild: the Binders tab. */
export default function OldOwnBinderPage() {
  redirect("/profile?tab=binders");
}
