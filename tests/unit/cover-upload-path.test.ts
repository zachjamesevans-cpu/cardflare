import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The founder: "Still can't change header / banner images... the photo
 * never updates or saves. App and website." Two faults on the website
 * side, each pinned here.
 */
describe("a cover from the website", () => {
  it("is allowed to be as big as the cropper's ceiling when it reaches the action", () => {
    const config = read("next.config.ts");
    expect(config).toContain('bodySizeLimit: "4mb"');
  });

  it("is decoded by an <img> when createImageBitmap refuses the photo", () => {
    const pipeline = read("src/lib/players/image-pipeline.ts");
    expect(pipeline).toContain("async function decodePicked(");
    expect(pipeline).toContain("return await createImageBitmap(file);");
    expect(pipeline).toContain("await image.decode();");
    expect(pipeline).toContain("const bitmap = await decodePicked(file);");
    /* The draw reads the picture's real size whichever decoder answered. */
    expect(pipeline).toContain("const { width, height } = sizeOf(bitmap);");
    expect(pipeline).toContain('if ("close" in bitmap) bitmap.close();');
  });
});
