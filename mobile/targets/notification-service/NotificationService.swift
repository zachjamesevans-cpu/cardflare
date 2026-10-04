import Intents
import UserNotifications

/// Turns a push from a person into a communication notification: their
/// picture large, the app's icon small in the corner, the way Messages
/// and Instagram look on the lock screen.
///
/// The server marks such a push mutable and puts two fields in its
/// data: `actorName` and `actorAvatar` (an https link to their still
/// picture). A push without them, a picture that will not download, or
/// anything else going wrong delivers the push exactly as it was sent.
/// Nothing here may cost the player a notification.
class NotificationService: UNNotificationServiceExtension {
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var original: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    let content = (request.content.mutableCopy() as? UNMutableNotificationContent)
      ?? UNMutableNotificationContent()
    original = content

    guard
      let data = Self.payload(from: request.content.userInfo),
      let name = data["actorName"] as? String, !name.isEmpty,
      let link = data["actorAvatar"] as? String,
      let url = URL(string: link), url.scheme == "https"
    else {
      contentHandler(content)
      return
    }

    /* A short leash: iOS gives an extension about thirty seconds in
       all, and a slow picture should cost the face, never the push. */
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 8
    config.timeoutIntervalForResource = 10
    let session = URLSession(configuration: config)
    session.dataTask(with: url) { [weak self] bytes, response, _ in
      session.finishTasksAndInvalidate()
      guard let self else { return }
      guard
        let bytes, !bytes.isEmpty,
        let http = response as? HTTPURLResponse, http.statusCode == 200
      else {
        self.deliver(content)
        return
      }
      self.deliver(Self.communication(content, name: name, picture: bytes) ?? content)
    }.resume()
  }

  override func serviceExtensionTimeWillExpire() {
    if let original { deliver(original) }
  }

  private func deliver(_ content: UNNotificationContent) {
    guard let handler = contentHandler else { return }
    contentHandler = nil
    handler(content)
  }

  /// Expo puts the push's `data` under `body` in userInfo; older paths put
  /// it at the top level. Either is read.
  private static func payload(from userInfo: [AnyHashable: Any]) -> [String: Any]? {
    if let body = userInfo["body"] as? [String: Any] { return body }
    if let body = userInfo["body"] as? String,
       let json = body.data(using: .utf8),
       let parsed = try? JSONSerialization.jsonObject(with: json) as? [String: Any] {
      return parsed
    }
    var flat: [String: Any] = [:]
    for (key, value) in userInfo {
      if let key = key as? String { flat[key] = value }
    }
    return flat
  }

  /// The push as a message from a person. Nil when iOS will not take it,
  /// and the caller then delivers the plain push.
  private static func communication(
    _ content: UNMutableNotificationContent,
    name: String,
    picture: Data
  ) -> UNNotificationContent? {
    let handle = INPersonHandle(value: name, type: .unknown)
    let sender = INPerson(
      personHandle: handle,
      nameComponents: nil,
      displayName: name,
      image: INImage(imageData: picture),
      contactIdentifier: nil,
      customIdentifier: name
    )
    let intent = INSendMessageIntent(
      recipients: nil,
      outgoingMessageType: .outgoingMessageText,
      content: content.body,
      speakableGroupName: nil,
      conversationIdentifier: name,
      serviceName: nil,
      sender: sender,
      attachments: nil
    )
    intent.setImage(INImage(imageData: picture), forParameterNamed: \.sender)

    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    interaction.donate(completion: nil)

    return try? content.updating(from: intent)
  }
}
