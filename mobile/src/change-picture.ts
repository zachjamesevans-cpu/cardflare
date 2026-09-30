import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { describeError, uploadAvatar } from "./api";

/**
 * Picking a picture and sending it, shared by every screen that offers
 * to: the Edit profile screen today, and the profile tab before it.
 *
 * The screen owns the words on its buttons; this owns the picker, the
 * shrink and the upload, so the two can never pick differently.
 */

export type PictureKind = "avatar" | "cover";

export interface PictureReporter {
  /** The line the screen shows while it happens, and what it says after. */
  say: (message: string | null) => void;
  /** Which upload is in flight, or null once it is not. */
  busy: (kind: PictureKind | null) => void;
}

/**
 * THE PICKER OPENS WITH NO CROPPER, AND THAT IS THE FIX.
 *
 * `allowsEditing: true` forces iOS onto the legacy UIImagePickerController,
 * which takes seconds to present on a big library and ignores the
 * `aspect` it was handed: its crop is always a square, so the cover it
 * sent up was a square whatever the box asked for. The founder: "it
 * takes 4-5 seconds just for the photo selection to come up", and the
 * banner "STILL does not work in app".
 *
 * Without it the modern PHPicker presents at once, and the whole picture
 * goes up. The server is the one cropper now: `setAvatar` squares a
 * picture and `setCover` cuts 4:3 from the top (src/lib/players/profile.ts),
 * the same as it does for the website's upload. No `aspect`, because
 * nothing here crops any more. `exif: false` keeps the orientation and
 * location blob off the wire; "current" hands over the asset as stored
 * rather than transcoding it first, which is the other half of the wait.
 */
const PICK: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  quality: 1,
  exif: false,
  preferredAssetRepresentationMode:
    ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
};

/**
 * Pick, shrink, convert, send. Everything lands as a JPEG well under
 * 200KB regardless of what the camera roll held - the founder's brief:
 * it must work first time and it must not be a server load.
 *
 * Resolves true when a new picture is on the server, so the caller
 * knows to re-read the profile. False for a cancel or a failure, which
 * has already been said through the reporter.
 */
export async function changePicture(
  kind: PictureKind,
  report: PictureReporter,
): Promise<boolean> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    report.say("cardflare needs photo access to change your picture.");
    return false;
  }

  const chosen = await ImagePicker.launchImageLibraryAsync(PICK);
  if (chosen.canceled || chosen.assets.length === 0) return false;

  report.busy(kind);
  report.say("Preparing picture…");
  try {
    /* Resize to the stored size and re-encode as JPEG, walking the
       quality down until it is comfortably small. Base64 length is a
       fine proxy: 200000 characters is roughly 150KB of image. */
    let quality = 0.8;
    let encoded: string | null = null;
    while (quality >= 0.2) {
      const out = await manipulateAsync(
        chosen.assets[0].uri,
        [{ resize: { width: kind === "cover" ? 1200 : 512 } }],
        { compress: quality, format: SaveFormat.JPEG, base64: true },
      );
      encoded = out.base64 ?? null;
      if (encoded && encoded.length <= (kind === "cover" ? 300_000 : 200_000)) break;
      quality -= 0.15;
    }
    if (!encoded) {
      report.say("That picture could not be read. Try a different one.");
      return false;
    }

    await uploadAvatar(
      encoded,
      (sent, total) => report.say(`Uploading picture… ${sent} of ${total}`),
      kind,
    );
    report.say(kind === "cover" ? "Cover updated." : "Picture updated.");
    return true;
  } catch (caught) {
    /*
     * What the server said, on screen and in the log. A commit the
     * server refuses answers with a sentence ("That picture is too
     * big."), and `describeError` carries it through with the status,
     * so the failure names itself rather than reading as "try again".
     */
    console.warn(
      kind === "cover" ? "cover upload failed" : "picture upload failed",
      caught,
    );
    report.say(`The picture did not go through (${describeError(caught)}). Try again.`);
    return false;
  } finally {
    report.busy(null);
  }
}

/**
 * The animated picture: a GIF, sent as it was picked.
 *
 * Deliberately not the flow above. That one resizes and re-encodes to
 * a JPEG, which is exactly the thing that turns an animation into one
 * frame of an animation - so a GIF cannot go through it and there was
 * no other way in. No crop either: the server squares it.
 *
 * The size ceiling is the transport's, not the format's. Every 6KB of
 * GIF is another request, so this is a couple of hundred of them at
 * 2MB, counted out loud while they go. The website takes larger ones
 * because a browser can send a body and this cannot.
 */
export async function changeAnimatedPicture(report: PictureReporter): Promise<boolean> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    report.say("cardflare needs photo access to change your picture.");
    return false;
  }

  const chosen = await ImagePicker.launchImageLibraryAsync({ ...PICK, base64: true });
  if (chosen.canceled || chosen.assets.length === 0) return false;

  const asset = chosen.assets[0];
  const looksAnimated =
    asset.mimeType === "image/gif" || /\.gif($|\?)/i.test(asset.uri);

  if (!looksAnimated) {
    report.say("An animated picture has to be a GIF.");
    return false;
  }

  const encoded = asset.base64 ?? null;
  if (!encoded) {
    report.say("That GIF could not be read. Try a different one.");
    return false;
  }

  /* Said before the wait rather than after it: base64 is four
     characters per three bytes, so this is the real file size. */
  if (encoded.length > 2_800_000) {
    report.say("That GIF is over 2MB. Try a shorter or smaller one.");
    return false;
  }

  report.busy("avatar");
  report.say("Uploading GIF…");
  try {
    await uploadAvatar(
      encoded,
      (sent, total) => report.say(`Uploading GIF… ${sent} of ${total}`),
      "avatar-animated",
    );
    report.say("Animated picture updated.");
    return true;
  } catch (caught) {
    console.warn("GIF upload failed", caught);
    report.say(`The GIF did not go through (${describeError(caught)}). Try again.`);
    return false;
  } finally {
    report.busy(null);
  }
}
