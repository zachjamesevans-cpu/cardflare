import { Gem, MapPin, Package, Tent } from "lucide-react";

/** What Max does for a vendor, as the /max page lists it. */

export const VENDOR_BENEFITS = [
  {
    icon: Package,
    title: "Upload before the show",
    description:
      "List what you're bringing from your dashboard, raw singles and graded slabs alike (PSA, BGS or CGC), so your inventory is searchable the moment the doors open.",
  },
  {
    icon: MapPin,
    title: "The sale finds you",
    description:
      "Attendees search the show the moment they arrive and get your booth number. Instead of asking every vendor in the hall, the buyer who wants your card walks straight to your table.",
  },
  {
    icon: Gem,
    title: "Slabs sell as slabs",
    description:
      "A PSA 10 and a BGS 9.5 are two different reasons to cross a hall. Buyers see the grader and grade on every result, best grade first.",
  },
  {
    icon: Tent,
    title: "One weekend at a time",
    description:
      "Claim your booth for each show and move it if the floor plan changes. Leave a show and your stock disappears from it, while your list stays ready for the next one.",
  },
] as const;
