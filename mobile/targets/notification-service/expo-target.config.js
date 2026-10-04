/**
 * The notification service extension: the piece of the app that runs on
 * the phone when a push arrives, before it is shown.
 *
 * The founder: "If someone reacts to your thing, whether a new follower
 * follows me, they like my post, they message me etc, the icon for the
 * push notification should show their profile picture." iOS only lets
 * an app do that one way: a communication notification, built here,
 * from the sender's name and picture the server puts on the push
 * (src/lib/notifications/notify.ts, `actorName` and `actorAvatar`).
 *
 * Generated into the Xcode project by @bacons/apple-targets at prebuild,
 * which also tells EAS about the extra target so it signs it.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = () => ({
  type: "notification-service",
  name: "NotificationService",
  bundleIdentifier: ".NotificationService",
  deploymentTarget: "15.1",
  frameworks: ["Intents"],
});
