/**
 * Whether the Local tab is on.
 *
 * Local — every Flare posted near you, and the conversations they
 * start — is built and works, and is switched OFF by the founder's
 * call (2026-09-02): "the local thing takes away from the purpose of
 * the app. If we're just a Facebook Marketplace for people basically,
 * I think it can get confusing, especially for just starting out."
 * The room is the thing only cardflare does; Local needs a density a
 * new city does not have, and routes around the store.
 *
 * Off means: the Room tab is back in the bar on both platforms, the
 * Local tab, its feed and its "I have this" door are hidden, and the
 * conversations people already had stay readable as Messages. The
 * server keeps answering every Local endpoint, so an app build from
 * before the switch keeps working. Nothing is deleted; the tables and
 * the code stay.
 *
 * Turning it back on is this constant and its twin in
 * mobile/src/local-enabled.ts (tests/unit/local-enabled.test.ts holds
 * them equal), a deploy, and a TestFlight build.
 */
export const LOCAL_ENABLED = false;
