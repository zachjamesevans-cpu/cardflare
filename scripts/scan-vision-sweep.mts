/**
 * The page finder against 150 made-up photos of a binder page: tilted
 * both ways, in perspective, with glare, with pockets empty in every
 * pattern (a gap in every row, a whole column, a half-filled last page),
 * and turned on its side. Each cut-out pocket's colour is checked against
 * the card that sits there, so a card placed one pocket over is caught.
 *
 *   npm run scan:sweep
 *
 * No keys, no database, about two minutes. Run it after any change to
 * page-vision.ts or page-geometry.ts. "asks" is the player being asked to
 * line the page up: safe. "WRONG" is a page placed confidently and wrongly:
 * never acceptable. Made-up photos are not real ones: for those, see
 * `npm run scan:compare -- photo.jpg --vision-only` and
 * tests/unit/real-binder-photos.test.ts.
 */
import { readPagePhoto } from "../src/lib/cards/page-vision";
import { middleColour, nearestSlot, photographed } from "../tests/helpers/binder-photo";

const all = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const only = (keep: number[]) => all.filter((s) => !keep.includes(s));
const cases: { empty: number[]; rotate: number; skew: number; glare?: number[] }[] = [];
for (const empty of [
  [],
  [1],
  [1, 5],
  [0, 4, 8],
  [3, 4, 5],
  [6, 7, 8],
  [2],
  [0, 2, 6, 8],
  [0, 1],
  [7],
]) {
  for (const rotate of [-7, 0, 6]) {
    for (const skew of [0, 0.08, 0.14])
      cases.push({ empty, rotate, skew, glare: empty.length ? [] : [4] });
  }
}
for (const empty of [
  only([0, 1, 2, 3]),
  only([0, 1, 2, 3, 4, 5, 6]),
  [2, 5, 8],
  only([1, 4, 7]),
  only([0, 8]),
]) {
  for (const rotate of [-12, 0, 11])
    for (const skew of [0, 0.2]) cases.push({ empty, rotate, skew });
}

let right = 0;
let wrong = 0;
let asks = 0;
for (const options of cases) {
  const vision = await readPagePhoto(await photographed(options));
  const label = JSON.stringify(options);
  if (vision.needsAlignment) {
    asks += 1;
    continue;
  }
  const problems: string[] = [];
  for (const pocket of vision.pockets) {
    const empty = options.empty.includes(pocket.slot);
    const shows = nearestSlot(await middleColour(pocket.jpeg));
    if (empty && !pocket.looksEmpty)
      problems.push(`${pocket.slot}: empty pocket not seen as empty`);
    if (!empty && pocket.looksEmpty)
      problems.push(`${pocket.slot}: card seen as empty`);
    if (!empty && shows !== pocket.slot)
      problems.push(`${pocket.slot}: shows the card from ${shows}`);
  }
  if (problems.length > 0) {
    wrong += 1;
    console.log(
      `WRONG ${label} (${vision.method}, ${vision.confidence}): ${problems.join("; ")}`,
    );
  } else right += 1;
}
for (const rotate of [90, -90]) {
  const vision = await readPagePhoto(await photographed({ rotate }));
  if (vision.needsAlignment) asks += 1;
  else {
    wrong += 1;
    console.log(`WRONG turned ${rotate}: did not ask`);
  }
}
console.log(`${right} right, ${asks} asks, ${wrong} wrong, of ${cases.length + 2}`);
if (wrong > 0) process.exit(1);
