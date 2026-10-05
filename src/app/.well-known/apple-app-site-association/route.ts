/**
 * Which cardflare.gg links an iPhone opens in the app instead of Safari.
 *
 * Apple reads this file (through its own CDN) when the app is installed
 * and the app's `associatedDomains` names applinks:cardflare.gg. Only the
 * share link for a binder, /b/<id>, is claimed: everything else stays a
 * web page, so nothing that works in a browser today changes underfoot.
 * Both shapes are written, the current `components` and the older
 * `paths`, because iOS before 13 reads only the second.
 *
 * The team and bundle ids are public facts about the app (they are in
 * every build), not secrets.
 */
const APP_ID = "J2N92N3SMA.gg.cardflare.app";

export const dynamic = "force-static";

export function GET(): Response {
  return Response.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: APP_ID,
          appIDs: [APP_ID],
          paths: ["/b/*"],
          components: [{ "/": "/b/*", comment: "A shared binder" }],
        },
      ],
    },
  });
}
