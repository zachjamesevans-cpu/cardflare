/**
 * What to paste above a Figma Make prompt so what comes back drops
 * straight into CardFlare.
 *
 * The founder asked: "is there anything in figma i should put before my
 * prompt, that would make transferring the file [work]." There is, and
 * every line of it exists because a real export got it wrong once.
 *
 * The page background and the placeholder face come from Figma Make
 * building a demo page rather than an asset - both had to be deleted by
 * hand from the lightning ring. The radius numbers are the geometry
 * PlayerAvatar draws to. The no-JavaScript line is not a style
 * preference: cosmetics are drawn with scripting switched off, so a
 * component that animates in a `setInterval` arrives frozen.
 *
 * Kept as data rather than as prose in a component so the console can
 * offer it as one copyable block, and so it is in version control where
 * it can be corrected when the next export teaches us something.
 */
export const FIGMA_BRIEF = `Build this as one self-contained React component in a single file.

- Export it as: export default function App()
- Draw ONLY the cosmetic itself. No page background, no placeholder
  avatar or face, no caption, no full-screen wrapper.
- The canvas is 400 x 400 with a fully transparent background.
- The player's photo fills the circle in the middle out to radius 148.
  Leave that circle completely empty.
- For a profile border, centre the ring on radius 152.
- Animate with CSS @keyframes only. No JavaScript animation, no
  timers, no state, no interaction, no event handlers.
- Import nothing except React. No external images, fonts, or URLs.
- A single <svg viewBox="0 0 400 400"> is ideal if the art suits it.
  Plain divs with CSS are fine too.`;
