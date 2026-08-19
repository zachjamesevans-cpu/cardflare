import { useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

import { API_BASE } from "./config";

/**
 * A cosmetic's uploaded art, drawn in the app.
 *
 * ONE URL, ON OUR OWN ORIGIN, FOR ALL THREE KINDS. That is the whole
 * design, and it replaces the thing that was wrong.
 *
 * The first version built an HTML document as a STRING in the app and
 * handed it to the WebView. It reads as tidy and it is a trap on iOS: a
 * string loaded with no base URL gets an opaque origin, and an
 * opaque-origin document is not a reliable place to fetch an https
 * subresource from. The founder's Haki ring - an SVG, uploaded, working
 * on the website - drew nothing on his phone, and the same markup
 * rendered perfectly when tested in Chromium, which is exactly the
 * shape of a WebKit-only origin problem.
 *
 * So the app no longer invents documents. It points at
 * `/cosmetic-player` on our own origin, and the server draws the art
 * with the same three renderers the website uses: an `<img>` for a
 * drawing, a sandboxed `<iframe>` for markup, a canvas for Rive. One
 * place to be right instead of two that can drift.
 *
 * JAVASCRIPT IS OFF EXCEPT FOR RIVE, and that exception is about whose
 * code runs rather than a relaxation. A .riv file cannot be drawn by a
 * browser at all - it is played by a runtime, and that runtime is
 * script - so it plays on our page, in our bundle, against our copy of
 * the WASM, with the uploaded file handed over as data. A drawing and a
 * page of uploaded markup keep scripting off, and always will.
 */

export interface ArtFile {
  kind: "rive" | "svg" | "html";
  url: string;
  /** Rive only: which artboard, or null for the file's default. */
  artboard?: string | null;
  /** Rive only: which state machine, or null for the file's default. */
  stateMachine?: string | null;
}

/**
 * The page that draws this file, or null if the file is not ours.
 *
 * The player takes a PATH on our origin and refuses anything else, so
 * the absolute URL the API hands us is reduced to one here. A file
 * somewhere else draws nothing rather than being pointed at.
 */
export function playerUrl(art: ArtFile): string | null {
  let path: string;
  try {
    const parsed = new URL(art.url);
    if (parsed.origin !== new URL(API_BASE).origin) return null;
    path = `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }

  const query = new URLSearchParams({ src: path, kind: art.kind });
  if (art.artboard) query.set("artboard", art.artboard);
  if (art.stateMachine) query.set("machine", art.stateMachine);

  return `${API_BASE}/cosmetic-player?${query.toString()}`;
}

export function CosmeticFilm({ art, size }: { art: ArtFile; size: number }) {
  const [failed, setFailed] = useState(false);

  const player = playerUrl(art);
  if (failed || !player) return null;

  return (
    <View
      pointerEvents="none"
      style={{ width: size, height: size, backgroundColor: "transparent" }}
    >
      <WebView
        source={{ uri: player }}
        /*
         * The containment, and its one exception.
         *
         * OFF for a drawing and for uploaded markup, which is the whole
         * bargain and the same one the website makes with `sandbox` and
         * no `allow-scripts`. ON only for Rive, which cannot be drawn
         * any other way, and only on our own page. Never widen this,
         * and never key it on anything an uploader controls.
         */
        javaScriptEnabled={art.kind === "rive"}
        domStorageEnabled={false}
        /*
         * Transparent, and on iOS that takes BOTH of these. Without
         * `opaque={false}` a WKWebView paints its own white page
         * behind the art, which as a worn ring is a white square over
         * somebody's face.
         */
        opaque={false}
        /*
         * Our ORIGIN - no path, no "/*", and that is load-bearing in a
         * way that shipped broken once. The library compares this list
         * against the URL's EXTRACTED ORIGIN, "https://cardflare.gg",
         * which has no trailing slash - so a pattern ending in "/*"
         * compiles to a regex demanding a slash, matches nothing, and
         * the library's answer to a non-whitelisted URL is not "block":
         * it is Linking.openURL. Tapping Profile tore the founder out
         * of the app into Safari with a cosmetic in a tab.
         *
         * An EMPTY list is the other cliff: it means "deny everything
         * including the page you were asked to show", which is why no
         * ring appeared in the app at all, once. Exactly this - the
         * bare origin - and nothing fancier on either side.
         */
        originWhitelist={[new URL(API_BASE).origin]}
        /*
         * Called for the FIRST load as well as later ones, so it has to
         * say yes to the player and no to wherever a file might try to
         * send the view afterwards. By PREFIX, not equality: iOS may
         * re-serialise the URL's query encoding, and an equality check
         * against our own string would refuse our own page. The
         * player's subresources are not navigations and are not
         * filtered here.
         */
        onShouldStartLoadWithRequest={(request) =>
          request.url.startsWith(`${API_BASE}/cosmetic-player`) ||
          request.url === "about:blank"
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
