import { redirect } from "next/navigation";

/**
 * Customize is a tab of Edit profile now (Look, and Showcase): the
 * founder, "move the edit profile button into the wand, they do the
 * exact same thing basically. like combine them". This address stays so
 * every old link lands in the right place.
 */
export default async function CustomizePage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string }>;
}) {
  const { area } = await searchParams;
  redirect(
    area === "showcase" ? "/profile/edit?tab=showcase" : "/profile/edit?tab=look",
  );
}
