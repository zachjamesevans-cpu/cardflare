import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { COVER_HEIGHT, COVER_WIDTH } from "@/lib/players/profile-image";

/**
 * The shape a cover is cropped to, and WHO crops it.
 *
 * The founder's first report: changing the profile banner left it "quite
 * zoomed in". Three numbers disagreed - the cropper offered a 2.67:1
 * strip, the server stored 1200x450, the profile drew a 1.3:1 box - and
 * they were brought to 4:3 everywhere.
 *
 * The second report, after that: "Changing a header banner in website
 * works, but STILL does not work in app... it takes 4-5 seconds just for
 * the photo selection to come up." Both symptoms were the app's cropper
 * itself. `allowsEditing: true` forces iOS onto the legacy picker, which
 * is slow to present on a big library and IGNORES the aspect it is
 * handed - its crop is always a square - so the cover that reached the
 * server was a square whatever the app asked for.
 *
 * So the app no longer crops at all. The picker hands over the whole
 * picture through the modern PHPicker, and the server is the one
 * cropper for both platforms: `setAvatar` squares, `setCover` cuts 4:3
 * from the top. The website keeps its in-browser cropper because a
 * browser can show one that tells the truth; it passes the server's own
 * constants through, which is what keeps it honest.
 */

const source = (path: string) => readFileSync(path, "utf8");

/**
 * The same file with its block comments stripped. The picker's comment
 * names the option it dropped, and a guard that trips on its own
 * explanation is a guard nobody can write the explanation for.
 */
const code = (path: string) => source(path).replace(/\/\*[\s\S]*?\*\//g, "");

describe("the cover's shape", () => {
  it("is four by three on the server", () => {
    expect(COVER_WIDTH / COVER_HEIGHT).toBeCloseTo(4 / 3, 5);
  });

  it("is the same shape the website's cropper offers", () => {
    /* The web passes the server's own constants straight through, which
       is the whole reason it cannot drift — assert that it still does
       rather than that the number is right. */
    const form = source("src/components/players/cover-form.tsx");

    expect(form).toContain("aspect={COVER_WIDTH / COVER_HEIGHT}");
  });

  it("keeps a picture square on the website", () => {
    expect(source("src/components/players/avatar-form.tsx")).toContain("aspect={1}");
  });
});

describe("the app's picker", () => {
  const picker = code("mobile/src/change-picture.ts");

  it("opens with no cropper, so iOS presents the modern picker", () => {
    /*
     * `allowsEditing` is the switch that brings the legacy picker back,
     * with its four-second open and its square-only crop. Absent
     * entirely rather than false, so nobody re-adds it "just for the
     * avatar": the server squares that one too.
     */
    expect(picker).not.toContain("allowsEditing");
    /* And no aspect, because nothing here crops any more. */
    expect(picker).not.toMatch(/\baspect:/);
    expect(picker).toContain('mediaTypes: ["images"]');
    expect(picker).toContain("quality: 1");
    expect(picker).toContain("exif: false");
    expect(picker).toContain("UIImagePickerPreferredAssetRepresentationMode.Current");
  });

  it("is the one picker for the picture, the cover and the GIF", () => {
    /* One options object, spread into the GIF flow, so the three
       cannot pick differently. */
    expect(picker).toContain("const PICK: ImagePicker.ImagePickerOptions");
    expect(picker.match(/launchImageLibraryAsync\(/g)?.length).toBe(2);
    expect(picker).toContain("launchImageLibraryAsync(PICK)");
    expect(picker).toContain("launchImageLibraryAsync({ ...PICK, base64: true })");
  });

  it("says what the server said when a commit is refused, and logs it", () => {
    /* A refused cover used to read as "try again". The server answers
       with a sentence; it reaches the screen and the console. */
    expect(picker).toContain("friendlyError(caught)");
    expect(picker).toContain('"cover upload failed"');
    expect(picker).toContain("console.warn(");
  });

  it("is what the Edit profile screen uses, and the profile tab no longer picks", () => {
    const edit = source("mobile/src/screens/edit-profile.tsx");
    expect(edit).toMatch(
      /import \{[^}]*pickPicture[^}]*\} from "\.\.\/change-picture"/,
    );
    expect(edit).toContain("uploadPicture(");
    expect(edit).toContain("changeAnimatedPicture(");

    const profile = code("mobile/src/screens/profile.tsx");
    expect(profile).not.toContain("ImagePicker");
    expect(profile).not.toContain("launchImageLibraryAsync");
  });
});

describe("what survives the crop", () => {
  it("keeps the top of the picture the app sends", () => {
    /*
     * The app sends the whole picture now, and the server decides which
     * band of it to keep. Both display layers have always anchored to
     * the top so a face in the upper half survives; the stored file
     * agrees.
     */
    expect(source("src/lib/players/profile.ts")).toContain(
      'fit: "cover", position: "top"',
    );
  });

  it("is taller than it is drawn anywhere but the profile, on purpose", () => {
    /*
     * Every other place a cover appears is wider and shorter — the peek's
     * strip, a desktop column — and crops the BOTTOM, which is the half
     * already dissolving into the card behind the name. Both platforms
     * anchor to the top so a face in the upper half survives.
     */
    expect(source("mobile/src/showcase-zoom.tsx")).toContain('contentPosition="top"');
    expect(source("src/components/players/profile-cover.tsx")).toContain("object-top");
  });
});
