#!/usr/bin/env node
/**
 * Collects a spoiler set into a manifest and a folder of pictures.
 *
 * Runs on a laptop, never on the server. Three reasons, and the first is
 * the one that decides it: a fan site's markup changes without warning,
 * and a scrape living inside a request handler turns somebody else's
 * redesign into our outage. The second is pace — a browser on a home
 * connection asking for two hundred images slowly is a very different
 * thing from a datacentre doing it fast. The third is that what the
 * server should accept is DATA, checked at the door, not a promise that
 * a page looked a certain way an hour ago.
 *
 * Two modes:
 *
 *   node scripts/scrape-set.mjs discover --url <page>
 *     Prints what the page actually contains — image counts by host,
 *     the shapes of nearby text, and a sample of candidate selectors.
 *     Run this FIRST. Nobody can write a correct selector for a page
 *     they have not looked at, and guessing produces a scraper that
 *     silently returns nothing.
 *
 *   node scripts/scrape-set.mjs collect --url <page> --set OP17 \
 *     --set-name "..." --out ./op17
 *     Writes ./op17/manifest.json and ./op17/images/*, ready for
 *     /admin/cards/import.
 *
 * `--selector` and `--number-pattern` override the defaults once
 * discover has told you what the page really looks like.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
/* From @playwright/test, which package.json actually declares. Importing
   "playwright" works today only because npm hoists it as a transitive
   dependency, and a clean install is free to stop doing that. */
import { chromium } from "@playwright/test";

/** Politeness. A spoiler site is somebody's hobby, not a CDN. */
const DELAY_MS = 400;

/** Consecutive refusals before this is one problem rather than many. */
const GIVE_UP_AFTER = 5;

/**
 * Launches a browser, honouring the same override the e2e suite uses.
 *
 * On a Mac with Playwright installed normally this needs nothing. In a
 * sandbox carrying a preinstalled Chromium of a different build,
 * PLAYWRIGHT_CHROMIUM_PATH points at it — the same escape hatch
 * AGENTS.md already documents, rather than a second convention.
 */
function launch() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  return chromium.launch(executablePath ? { executablePath } : {});
}

/**
 * A browser, an explicit context, and a page in it.
 *
 * The context is explicit because `fetchImage` opens a second tab beside
 * the gallery when a download is refused, and `page.context().newPage()`
 * throws "Please use browser.newContext()" on the implicit context that
 * `browser.newPage()` creates. That crash only appears on the fallback
 * path, so it survived every run where nothing was refused.
 */
async function openPage() {
  const browser = await launch();
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
  });
  return { browser, page: await context.newPage() };
}

/** Card numbers look like OP17-001. Overridable for other games. */
const DEFAULT_NUMBER_PATTERN = "[A-Z]{2,4}\\d{2}-\\d{3}";

function usage(message) {
  if (message) console.error(`\n${message}\n`);
  console.error(
    [
      "Usage:",
      "  node scripts/scrape-set.mjs discover --url <page>",
      "  node scripts/scrape-set.mjs collect --url <page> --set OP17 \\",
      "      --set-name 'Set name' --out ./op17 [--selector 'img'] \\",
      "      [--number-pattern '[A-Z]{2,4}\\\\d{2}-\\\\d{3}'] [--provider kaizoku]",
      "      [--no-upgrade]   keep the thumbnail the page shows",
      "",
    ].join("\n"),
  );
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Scrolls to the bottom, repeatedly, until nothing new appears.
 *
 * Spoiler pages are almost always lazy-loaded galleries. A scraper that
 * reads the DOM on arrival gets the first dozen cards and reports
 * success, which is the most expensive kind of wrong.
 */
async function loadEverything(page) {
  let previous = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const count = await page.locator("img").count();
    if (count === previous && attempt > 2) break;
    previous = count;
    await page.mouse.wheel(0, 20000);
    await sleep(500);
  }
  return previous;
}

async function discover(args) {
  if (!args.url) usage("discover needs --url");

  const { browser, page } = await openPage();

  console.log(`Opening ${args.url} …`);
  await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const total = await loadEverything(page);
  console.log(`\n${total} <img> elements after scrolling to the end.\n`);

  const report = await page.evaluate(() => {
    const images = [...document.querySelectorAll("img")];

    const byHost = {};
    for (const img of images) {
      const src = img.currentSrc || img.src || "";
      if (!src) continue;
      try {
        const host = new URL(src, location.href).host;
        byHost[host] = (byHost[host] ?? 0) + 1;
      } catch {
        byHost["(unparseable)"] = (byHost["(unparseable)"] ?? 0) + 1;
      }
    }

    /* A card number in the alt text, the file name, or nearby text is
       what makes an image identifiable. Which of the three it is
       decides how `collect` has to be pointed at the page. */
    const pattern = /[A-Z]{2,4}\d{2}-\d{3}/;
    const withNumber = { alt: 0, src: 0, nearbyText: 0 };
    const samples = [];

    for (const img of images) {
      const src = img.currentSrc || img.src || "";
      const alt = img.getAttribute("alt") ?? "";
      const near = img.closest("li, article, figure, div")?.textContent ?? "";

      const hit = {
        alt: pattern.test(alt),
        src: pattern.test(decodeURIComponent(src)),
        nearbyText: pattern.test(near),
      };

      if (hit.alt) withNumber.alt += 1;
      if (hit.src) withNumber.src += 1;
      if (hit.nearbyText) withNumber.nearbyText += 1;

      if (samples.length < 8 && (hit.alt || hit.src || hit.nearbyText)) {
        samples.push({
          src: src.slice(0, 160),
          alt: alt.slice(0, 80),
          near: near.replace(/\s+/g, " ").trim().slice(0, 120),
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      }
    }

    /* Anything on the page that looks like a set name, so `--set-name`
       does not have to be guessed either. */
    const headings = [...document.querySelectorAll("h1, h2, h3")]
      .map((h) => h.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter(Boolean)
      .slice(0, 25);

    return { byHost, withNumber, samples, headings };
  });

  console.log("Images by host:");
  for (const [host, count] of Object.entries(report.byHost).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${String(count).padStart(4)}  ${host}`);
  }

  console.log("\nWhere a card number appears:");
  console.log(`  in alt text .... ${report.withNumber.alt}`);
  console.log(`  in the URL ..... ${report.withNumber.src}`);
  console.log(`  in nearby text . ${report.withNumber.nearbyText}`);

  console.log("\nSamples:");
  for (const sample of report.samples) {
    console.log(`  ${sample.width}x${sample.height}  ${sample.src}`);
    if (sample.alt) console.log(`      alt:  ${sample.alt}`);
    if (sample.near) console.log(`      near: ${sample.near}`);
  }

  console.log("\nHeadings on the page:");
  for (const heading of report.headings) console.log(`  ${heading}`);

  /* Saved so a later run can be written against the real markup without
     opening the site again, and so a future change is a diff. */
  const html = await page.content();
  await writeFile("discover.html", html, "utf8");
  console.log("\nFull HTML written to discover.html");

  await browser.close();
}

/**
 * Where a gallery keeps its bigger renders.
 *
 * Kaizoku serves `OP17-001_sm.webp` at 172x240, which is a thumbnail —
 * fine on a board tile at 56 pixels, a blurry mess the moment somebody
 * taps a card to look at it. The full-size file turned out to be
 * `OP17-001.png`: no suffix AND a different extension. A first draft
 * probed suffixes only and would have missed it entirely, so both axes
 * are tried.
 *
 * Ordered by what the evidence says is most likely, but the winner is
 * decided by the bytes that come back, never by this order.
 */
const LARGER_SUFFIXES = ["", "_lg", "_l", "_full", "_md", "_m"];
const LARGER_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

/**
 * The best available render of one card, found by asking the server
 * rather than by hardcoding a pattern from one sample.
 *
 * Returns the original untouched when nothing better answers, so a
 * gallery that genuinely only has thumbnails still collects rather than
 * failing. `seen` caches the verdict across cards: two hundred cards on
 * one CDN share one naming scheme, and re-probing two dozen variants
 * each would be thousands of pointless requests at somebody else's
 * expense.
 */
async function bestRender(request, src, seen, referer) {
  /* Same hotlink protection as the download itself: a probe without a
     Referer is refused, which would make every candidate look absent
     and quietly settle for the thumbnail. */
  const headers = {
    referer,
    accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  };
  const match = /^(.*?)(_sm|_s|_thumb|_small)?(\.[a-z0-9]+)$/i.exec(src);
  if (!match) return { src, note: null };

  const [, stem, thumbSuffix, extension] = match;

  if (seen.has("winner")) {
    const winner = seen.get("winner");
    return winner ? { src: `${stem}${winner}`, note: null } : { src, note: null };
  }

  const original = await request.get(src, { headers }).catch(() => null);
  const originalSize = original?.ok() ? (await original.body()).length : 0;

  /* Both axes, because the real answer changed both. Deduplicated so a
     candidate identical to what the page already showed is skipped. */
  const candidates = [];
  for (const suffix of LARGER_SUFFIXES) {
    for (const ext of [...new Set([...LARGER_EXTENSIONS, extension])]) {
      const tail = `${suffix}${ext}`;
      if (`${stem}${tail}` !== src) candidates.push(tail);
    }
  }

  for (const tail of candidates) {
    const response = await request.get(`${stem}${tail}`, { headers }).catch(() => null);
    if (!response?.ok()) continue;

    const size = (await response.body()).length;
    /* Meaningfully bigger, not merely different: a CDN that answers
       every path with the same placeholder must not win here. */
    if (size > originalSize * 1.2) {
      seen.set("winner", tail);
      return {
        src: `${stem}${tail}`,
        note: `larger render found: "${thumbSuffix ?? ""}${extension}" -> "${tail}" (${Math.round(originalSize / 1024)}KB -> ${Math.round(size / 1024)}KB)`,
      };
    }
  }

  seen.set("winner", null);
  return {
    src,
    note: "no larger render answered; collecting what the page shows",
  };
}

/**
 * Asks for one image the way a browser would.
 *
 * A plain `request.get` returned 403 for every card on Kaizoku's CDN
 * while the very same URLs rendered fine in the page. That is hotlink
 * protection: the server is checking where the request came from, and a
 * bare fetch does not look like a page loading a picture.
 *
 * So two attempts, cheapest first. A request carrying the page's own
 * Referer covers the ordinary case. When that is still refused, a real
 * navigation in a real tab carries the browser's whole fingerprint and
 * is the closest thing to what the gallery itself does — slower, which
 * is why it is second rather than first.
 *
 * Returns null when both are refused, so the caller can report the
 * status rather than write a 403 body to disk as if it were a card.
 */
async function fetchImage(page, url, referer) {
  const headers = {
    referer,
    accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  };

  const direct = await page.request.get(url, { headers }).catch(() => null);
  if (direct?.ok()) {
    return {
      body: await direct.body(),
      type: (direct.headers()["content-type"] ?? "").split(";")[0].trim(),
      status: direct.status(),
    };
  }

  const tab = await page.context().newPage();
  try {
    const response = await tab.goto(url, {
      referer,
      waitUntil: "commit",
      timeout: 30_000,
    });

    if (response?.ok()) {
      return {
        body: await response.body(),
        type: (response.headers()["content-type"] ?? "").split(";")[0].trim(),
        status: response.status(),
      };
    }

    return {
      body: null,
      type: null,
      status: response?.status() ?? direct?.status() ?? 0,
    };
  } catch {
    return { body: null, type: null, status: direct?.status() ?? 0 };
  } finally {
    await tab.close();
  }
}

async function collect(args) {
  if (!args.url) usage("collect needs --url");
  if (!args.set) usage("collect needs --set, e.g. --set OP17");
  if (!args["set-name"]) usage("collect needs --set-name");

  const out = args.out ?? `./${String(args.set).toLowerCase()}`;
  const provider = args.provider ?? "kaizoku";
  const selector = args.selector ?? "img";
  const pattern = new RegExp(args["number-pattern"] ?? DEFAULT_NUMBER_PATTERN);

  await mkdir(join(out, "images"), { recursive: true });

  const { browser, page } = await openPage();

  console.log(`Opening ${args.url} …`);
  await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await loadEverything(page);

  const found = await page.evaluate(
    ({ selector, source }) => {
      const pattern = new RegExp(source);

      return [...document.querySelectorAll(selector)]
        .map((img) => {
          const src = img.currentSrc || img.src || "";
          const alt = img.getAttribute("alt") ?? "";
          const near = img.closest("li, article, figure, div")?.textContent ?? "";

          const number =
            pattern.exec(alt)?.[0] ??
            pattern.exec(decodeURIComponent(src))?.[0] ??
            pattern.exec(near)?.[0] ??
            null;

          /*
           * Kaizoku writes the rarity as a bare token straight after the
           * number in the caption — "OP17-001 L", "OP17-005 SR". Taken
           * only when it is one of the codes the game actually uses, so
           * a caption that happens to end in a word does not become a
           * rarity nobody has heard of.
           */
          const RARITIES = new Set([
            "L",
            "C",
            "UC",
            "R",
            "SR",
            "SEC",
            "P",
            "SP",
            "DON",
          ]);
          const after = number
            ? near
                .slice(near.indexOf(number) + number.length)
                .trim()
                .split(/\s+/)[0]
            : "";
          const rarity = RARITIES.has(after?.toUpperCase())
            ? after.toUpperCase()
            : null;

          return {
            src: src ? new URL(src, location.href).href : null,
            number,
            rarity,
            /* The alt without the number is usually the card's name.
               Verified by eye before importing, never trusted blind. */
            name:
              alt
                .replace(pattern, "")
                .replace(/[\s|·—–-]+/g, " ")
                .trim() ||
              near.replace(pattern, "").replace(/\s+/g, " ").trim().slice(0, 80),
            width: img.naturalWidth,
          };
        })
        .filter((card) => card.src && card.number);
    },
    { selector, source: pattern.source },
  );

  /* Biggest render of each number wins: galleries commonly hold a
     thumbnail and a full-size copy of the same card. */
  const best = new Map();
  for (const card of found) {
    const existing = best.get(card.number);
    if (!existing || card.width > existing.width) best.set(card.number, card);
  }

  console.log(`\n${found.length} matches, ${best.size} distinct card numbers.`);

  if (best.size === 0) {
    console.error(
      "\nNothing matched. Run `discover` and pass --selector / --number-pattern.\n",
    );
    await browser.close();
    process.exit(1);
  }

  const cards = [];
  let downloaded = 0;
  let refused = 0;

  /* Shared across every card, so the suffix is worked out once. */
  const renderChoice = new Map();

  for (const card of [...best.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  )) {
    const { src, note } = args["no-upgrade"]
      ? { src: card.src, note: null }
      : await bestRender(page.request, card.src, renderChoice, args.url);

    if (note) console.log(`\n  ${note}`);

    const image = await fetchImage(page, src, args.url);

    if (!image.body) {
      refused += 1;
      console.error(`\n  ${card.number}: HTTP ${image.status}, skipped`);

      /*
       * Stop rather than grind. The first run against the real CDN
       * printed two hundred identical 403 lines and wrote an empty
       * manifest: when everything is refused it is one problem, not two
       * hundred, and hammering somebody's server to prove it again is
       * rude as well as pointless.
       */
      if (refused >= GIVE_UP_AFTER && downloaded === 0) {
        console.error(
          [
            "",
            `Every request so far came back ${image.status}.`,
            "",
            "That is the CDN refusing a fetch that does not look like a",
            "page loading a picture. Both the Referer request and a real",
            "browser navigation were refused, so this needs a look rather",
            "than a retry. Send me this output.",
            "",
            `  tried: ${src}`,
            "",
          ].join("\n"),
        );
        await browser.close();
        process.exit(1);
      }

      continue;
    }

    const type = image.type ?? "";
    const extension =
      type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
    const file = `${card.number}.${extension}`;

    await writeFile(join(out, "images", file), image.body);
    downloaded += 1;

    cards.push({
      cardNumber: card.number,
      name: card.name || card.number,
      file,
      sourceUrl: src,
      ...(card.rarity ? { rarity: card.rarity } : {}),
    });

    process.stdout.write(`\r  downloaded ${downloaded}/${best.size}`);
    await sleep(DELAY_MS);
  }

  const manifest = {
    provider,
    setCode: String(args.set).toUpperCase(),
    setName: args["set-name"],
    cards,
  };

  await writeFile(
    join(out, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  console.log(`\n\nWrote ${out}/manifest.json (${cards.length} cards)`);
  console.log(`Images in ${out}/images/`);
  console.log("\nCHECK THE NAMES before importing. They are guessed from alt text,");
  console.log("and a wrong name in the catalogue is worse than a missing one.\n");

  await browser.close();
}

const args = parseArgs(process.argv.slice(2));
const mode = args._[0];

if (mode === "discover") await discover(args);
else if (mode === "collect") await collect(args);
else usage(mode ? `Unknown mode: ${mode}` : null);
