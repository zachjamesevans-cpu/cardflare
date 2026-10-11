/**
 * app.json, unchanged, except in the demo.
 *
 * `npm run demo` (mobile/package.json) starts the app with the root's
 * .env.demo loaded, which sets CARDFLARE_DEMO=1. Only then is the app
 * pointed at the demo world instead of cardflare.gg: the website running
 * on this Mac, and the demo Supabase project. See supabase/demo/README.md.
 * Every other build (Expo Go, `expo run:ios`, EAS, TestFlight) reads
 * app.json exactly as it is.
 */
module.exports = ({ config }) => {
  if (process.env.CARDFLARE_DEMO !== "1") return config;
  const apiBase = process.env.DEMO_API_BASE || "http://localhost:3000";
  return {
    ...config,
    extra: {
      ...config.extra,
      apiBase,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        /* The demo's website is plain http on this Mac. */
        NSAppTransportSecurity: {
          NSAllowsLocalNetworking: true,
          NSExceptionDomains: {
            localhost: { NSExceptionAllowsInsecureHTTPLoads: true },
          },
        },
      },
    },
  };
};
