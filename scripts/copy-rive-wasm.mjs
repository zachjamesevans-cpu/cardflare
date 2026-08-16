import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Puts the Rive runtime's WebAssembly module where the browser can
 * fetch it from OUR origin.
 *
 * The library's default is a CDN, and this product has one hard field
 * fact about middleboxes on the founder's network: they eat what they
 * did not expect. Copying rather than committing the binary means the
 * .wasm can never drift from the version of the runtime that npm
 * actually installed - a mismatch there fails at run time, in a
 * player's browser, which is the worst place to find out.
 *
 * Runs before dev and before build, so both have it.
 */
const require = createRequire(import.meta.url);

const source = join(dirname(require.resolve("@rive-app/canvas")), "rive.wasm");
const target = join(process.cwd(), "public", "rive", "rive.wasm");

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);

console.log(`Rive WASM copied to ${target}`);
