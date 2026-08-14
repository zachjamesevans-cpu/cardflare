/* eslint-disable @typescript-eslint/no-require-imports */
const { getDefaultConfig } = require("expo/metro-config");

/**
 * SDK 54 turned on `experimentalImportSupport` by default, and its
 * import/export plugin has a confirmed module-ordering bug
 * (expo/expo#39277): in optimized bundles, a module's initialization
 * can run AFTER the exports that depend on it. react-native-skia was
 * the documented casualty; the failure mode for an app is JavaScript
 * dying during bundle evaluation in release builds only - which on iOS
 * is an eternal splash screen with no crash log, exactly what three
 * TestFlight builds of this app did while Expo Go ran the same code
 * happily. Off until the fix lands upstream; this restores the
 * pre-54 stable transform, inline requires included.
 */
const config = getDefaultConfig(__dirname);

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;
