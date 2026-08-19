import { useMemo, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

import { API_BASE } from "./config";

/**
 * A cosmetic's uploaded art, drawn in the app.
 *
 * The website draws a drawing in an `<img>` and HTML art in a
 * script-free sandboxed iframe. React Native has neither: `Image` will
 * not render an SVG at all, and nothing in RN runs CSS keyframes. What
 * it does have is a WebView, which is the same engine the website's
 * two renderers are, so both kinds go through one here.
 *
 * JavaScript is OFF FOR UPLOADED ART. That is the whole containment,
 * and it is the same bargain the web makes with `sandbox` and no
 * `allow-scripts`: CSS animates, nothing executes. The document the
 * server stored already carries a `default-src 'none'` policy, so the
 * art cannot fetch anything either, and `originWhitelist` keeps the
 * view itself from navigating anywhere.
 *
 * A drawing arrives as a bare .svg rather than a document, so it is
 * wrapped in the smallest page that will scale it - written here to
 * match what `artDocument` does on the server, because the two have to
 * agree or the same cosmetic looks different on the two platforms.
 *
 * RIVE IS THE EXCEPTION, and it is an exception about whose code runs
 * rather than a relaxation. A .riv file cannot be drawn by a browser at
 * all; it is played by a runtime, and that runtime is script. So Rive
 * goes to `/cosmetic-player` on our own origin - our bundle, our WASM -
 * with the file handed over as data. Scripting is on for that one frame
 * and nothing an uploader supplied is ever the thing running. This kind
 * used to return null, which is why a founder wearing a Rive ring saw a
 * bare avatar and a working website.
 */

/** The page a bare SVG is shown in. Mirrors artDocument in html-file.ts. */
function svgPage(url: string): string {
  return (
    "<!doctype html><html><head><meta charset='utf-8'>" +
    "<meta http-equiv='Content-Security-Policy' " +
    `content="default-src 'none'; style-src 'unsafe-inline'; img-src ${new URL(url).origin} data:">` +
    "<style>html,body{margin:0;padding:0;width:100%;height:100%;" +
    "background:transparent;overflow:hidden}" +
    "img{width:100%;height:100%;display:block;object-fit:contain}" +
    "</style></head><body>" +
    `<img src="${url.replace(/"/g, "&quot;")}" alt="">` +
    "</body></html>"
  );
}

export interface ArtFile {
  kind: "rive" | "svg" | "html";
  url: string;
  /** Rive only: which artboard, or null for the file's default. */
  artboard?: string | null;
  /** Rive only: which state machine, or null for the file's default. */
  stateMachine?: string | null;
}

/**
 * The page that plays a Rive cosmetic, on our own origin.
 *
 * A .riv file is not a picture: it is played BY a runtime, and the
 * runtime is JavaScript and WebAssembly. There is no way to draw one
 * with scripting off, which is why this kind used to return null and a
 * founder wearing a Rive ring saw a bare avatar.
 *
 * So the file goes to `/cosmetic-player`, which is OUR page running OUR
 * bundle against OUR copy of the WASM, and the .riv is handed to it as
 * data. Scripting is on for that frame and nothing an uploader supplied
 * is ever the script - the same distinction the website makes, since it
 * plays these with the identical component. Uploaded SVG and uploaded
 * HTML keep scripting off, and always will.
 */
function riveHost(art: ArtFile): string | null {
  /* The player takes a PATH on our origin and refuses anything else, so
     the absolute URL the API hands us is reduced to one here. */
  let path: string;
  try {
    const parsed = new URL(art.url);
    if (parsed.origin !== new URL(API_BASE).origin) return null;
    path = `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }

  const query = new URLSearchParams({ src: path });
  if (art.artboard) query.set("artboard", art.artboard);
  if (art.stateMachine) query.set("machine", art.stateMachine);

  return `${API_BASE}/cosmetic-player?${query.toString()}`;
}

export function CosmeticFilm({ art, size }: { art: ArtFile; size: number }) {
  const [failed, setFailed] = useState(false);

  /* The one origin this frame is allowed to load from: the art's own. */
  const origin = useMemo(() => {
    try {
      return new URL(art.url).origin;
    } catch {
      return null;
    }
  }, [art.url]);

  if (failed) return null;

  /*
   * Rive plays through our own page; everything else is the art itself,
   * with scripting off. `player` is null when the file is not on our
   * origin, which draws nothing rather than pointing a scripting-enabled
   * frame at somebody else's server.
   */
  const player = art.kind === "rive" ? riveHost(art) : null;
  if (art.kind === "rive" && !player) return null;

  const source = player
    ? { uri: player }
    : art.kind === "html"
      ? { uri: art.url }
      : { html: svgPage(art.url) };

  return (
    <View
      pointerEvents="none"
      style={{ width: size, height: size, backgroundColor: "transparent" }}
    >
      <WebView
        source={source}
        /*
         * The containment, and the one exception to it.
         *
         * OFF for uploaded art - an SVG or a page of HTML somebody sent
         * us - which is the whole bargain, and the same one the website
         * makes with `sandbox` and no `allow-scripts`. ON only for our
         * own player page, where the script is our bundle and the
         * uploaded file is the data it reads. Never widen this.
         */
        javaScriptEnabled={player !== null}
        domStorageEnabled={false}
        /*
         * Transparent, and on iOS that takes BOTH of these. Without
         * `opaque={false}` a WKWebView paints its own white page
         * behind the art, which as a worn ring is a white square over
         * somebody's face.
         */
        opaque={false}
        /*
         * The art's own origin, and nothing else. An empty list here
         * does not mean "deny navigation", it means "deny everything
         * including the page you were asked to show" - the first cut
         * had that, and it is why no ring appeared in the app at all.
         */
        originWhitelist={origin ? [`${origin}/*`] : ["about:blank"]}
        /*
         * Called for the FIRST load as well as later ones, so this
         * has to say yes to the art itself and no to anything a file
         * tries to navigate to afterwards. Returning a flat false
         * blocked the art from ever appearing.
         */
        onShouldStartLoadWithRequest={(request) =>
          request.url === (player ?? art.url) ||
          request.url === "about:blank" ||
          request.url.startsWith("data:")
        }
        scrollEnabled={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        /* A cosmetic that will not load is a cosmetic nobody sees, not
           a broken profile: the avatar underneath is already drawn. */
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        androidLayerType="hardware"
        style={{ width: size, height: size, backgroundColor: "transparent" }}
        containerStyle={{ backgroundColor: "transparent" }}
      />
    </View>
  );
}
