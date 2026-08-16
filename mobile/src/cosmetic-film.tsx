import { useMemo, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

/**
 * A cosmetic's uploaded art, drawn in the app.
 *
 * The website draws a drawing in an `<img>` and HTML art in a
 * script-free sandboxed iframe. React Native has neither: `Image` will
 * not render an SVG at all, and nothing in RN runs CSS keyframes. What
 * it does have is a WebView, which is the same engine the website's
 * two renderers are, so both kinds go through one here.
 *
 * JavaScript is OFF. That is the whole containment, and it is the same
 * bargain the web makes with `sandbox` and no `allow-scripts`: CSS
 * animates, nothing executes. The document the server stored already
 * carries a `default-src 'none'` policy, so the art cannot fetch
 * anything either, and `originWhitelist` keeps the view itself from
 * navigating anywhere.
 *
 * A drawing arrives as a bare .svg rather than a document, so it is
 * wrapped in the smallest page that will scale it - written here to
 * match what `artDocument` does on the server, because the two have to
 * agree or the same cosmetic looks different on the two platforms.
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

  /*
   * Rive is carried by the API but never drawn here. Playing one needs
   * a native runtime, and the founder has stopped making them: "I will
   * not be using rive any more." Nothing new arrives as Rive, and the
   * handful already in the catalogue simply do not show on a phone
   * rather than crashing it.
   */
  if (art.kind === "rive" || failed) return null;

  const source =
    art.kind === "html" ? { uri: art.url } : { html: svgPage(art.url) };

  return (
    <View
      pointerEvents="none"
      style={{ width: size, height: size, backgroundColor: "transparent" }}
    >
      <WebView
        source={source}
        /* The containment. Never turn this on for uploaded art. */
        javaScriptEnabled={false}
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
          request.url === art.url ||
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
