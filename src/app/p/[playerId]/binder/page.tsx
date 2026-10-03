import { redirect } from "next/navigation";

/** The binder's old address, kept for links in the wild: their Binders tab. */
export default async function OldPlayerBinderPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  redirect(`/p/${playerId}?tab=binders`);
}
