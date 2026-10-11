/**
 * The demo world, for App Store screenshots and marketing.
 *
 *   npm run demo -- check      the settings are there, and none is production
 *   npm run demo -- migrate    every migration, in order, once each
 *   npm run demo -- catalogue  the One Piece catalogue, the real one
 *   npm run demo -- users      the hero and twelve cast accounts
 *   npm run demo -- seed       supabase/demo/seed.sql: the room, the Feed,
 *                              the binder, the profile, the thread
 *   npm run demo -- all        all of the above, in that order
 *
 * The founder (2026-10-11): "almost code test rooms that look real". So a
 * separate, throwaway Supabase project is filled with believable players,
 * a live Event Room tonight at a fictional store, Flares, a full binder
 * and a finished trade, and the real app is pointed at it in the iOS
 * Simulator (see supabase/demo/README.md). Never production: fake players
 * in the real database would show up in real people's rooms and feeds.
 * Every command refuses a production URL before it connects.
 *
 * Reads .env.demo (gitignored; .env.demo.example is the template):
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY of the demo
 * project, DEMO_DATABASE_URL (its Postgres connection string),
 * DEMO_PASSWORD for the demo accounts, and DEMO_HERO_NAME. Nothing is
 * printed of any of them.
 *
 * Runs under `tsx --conditions=react-server --env-file=.env.demo`.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const root = resolve(import.meta.dirname, "..");

/** The production project. Nothing here may touch it. */
const PRODUCTION_REF = "wfpxjqumrkyqcingazsp";

/** The hero, then twelve cast, as seed.sql expects them. */
export const DEMO_EMAILS = [
  "hero@demo.cardflare.gg",
  ...Array.from(
    { length: 12 },
    (_, index) => `cast${String(index + 1).padStart(2, "0")}@demo.cardflare.gg`,
  ),
];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Whether a URL or connection string points at production. */
export function isProduction(value: string | undefined): boolean {
  return Boolean(value && value.includes(PRODUCTION_REF));
}

function settings() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const databaseUrl = process.env.DEMO_DATABASE_URL ?? "";
  const password = process.env.DEMO_PASSWORD ?? "";
  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
    !databaseUrl && "DEMO_DATABASE_URL",
    password.length < 8 && "DEMO_PASSWORD (8 characters or more)",
  ].filter(Boolean);
  if (missing.length > 0) fail(`.env.demo is missing: ${missing.join(", ")}`);
  if (isProduction(url) || isProduction(databaseUrl)) {
    fail("Refusing: .env.demo points at the production project. Use the demo project.");
  }
  return { url, serviceKey, databaseUrl, password };
}

function database(databaseUrl: string) {
  return postgres(databaseUrl, {
    max: 1,
    /* Supabase's pooler does not keep prepared statements. */
    prepare: false,
    onnotice: (notice) => console.log(`  ${notice.message}`),
  });
}

async function migrate(databaseUrl: string) {
  const sql = database(databaseUrl);
  try {
    await sql.unsafe(`
      create schema if not exists demo_meta;
      create table if not exists demo_meta.applied (
        name text primary key,
        applied_at timestamptz not null default now()
      );`);
    const done = new Set(
      (await sql<{ name: string }[]>`select name from demo_meta.applied`).map(
        (row) => row.name,
      ),
    );
    const folder = join(root, "supabase/migrations");
    const files = readdirSync(folder)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    let applied = 0;
    for (const name of files) {
      if (done.has(name)) continue;
      process.stdout.write(`  ${name}\n`);
      await sql.unsafe(readFileSync(join(folder, name), "utf8"));
      await sql`insert into demo_meta.applied (name) values (${name})`;
      applied += 1;
    }
    console.log(
      `Migrations: ${applied} applied, ${files.length - applied} already there.`,
    );
  } finally {
    await sql.end();
  }
}

function catalogue() {
  /* The real sync, against the demo project: the same command the
     production catalogue came from. */
  const run = spawnSync(
    "npx",
    [
      "tsx",
      "--conditions=react-server",
      "--env-file=.env.demo",
      "scripts/sync-onepiece.ts",
      "--full",
      "--confirm",
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (run.status !== 0) fail("The catalogue sync failed; see above.");
}

async function users(url: string, serviceKey: string, password: string) {
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listError) fail(`Could not list users: ${listError.message}`);
  const existing = new Map(listed.users.map((user) => [user.email, user.id]));
  for (const email of DEMO_EMAILS) {
    const id = existing.get(email);
    const { error } = id
      ? await admin.auth.admin.updateUserById(id, { password, email_confirm: true })
      : await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) fail(`Could not set up ${email}: ${error.message}`);
  }
  console.log(`Accounts: ${DEMO_EMAILS.length} ready. Sign in as ${DEMO_EMAILS[0]}.`);
}

/** The seed, with the hero's name set for it, as one string. */
export function seedScript(heroName: string): string {
  const name = heroName.trim().slice(0, 40) || "Zach";
  const literal = `'${name.replace(/'/g, "''")}'`;
  return [
    `select set_config('demo.hero_name', ${literal}, false);`,
    readFileSync(join(root, "supabase/demo/seed.sql"), "utf8"),
  ].join("\n");
}

async function seed(databaseUrl: string) {
  const sql = database(databaseUrl);
  try {
    await sql.unsafe(seedScript(process.env.DEMO_HERO_NAME ?? ""));
    console.log("Seeded. Run it again any time to make it all fresh and live.");
  } finally {
    await sql.end();
  }
}

async function main() {
  const command = process.argv[2] ?? "";
  const known = ["check", "migrate", "catalogue", "users", "seed", "all"];
  if (!known.includes(command)) {
    fail(`Usage: npm run demo -- <${known.join("|")}>`);
  }
  const { url, serviceKey, databaseUrl, password } = settings();
  if (command === "check") {
    console.log("Demo settings look right, and none of them is production.");
    return;
  }
  if (command === "migrate" || command === "all") await migrate(databaseUrl);
  if (command === "catalogue" || command === "all") catalogue();
  if (command === "users" || command === "all") await users(url, serviceKey, password);
  if (command === "seed" || command === "all") await seed(databaseUrl);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error: unknown) => {
    /* The message only: a connection error can quote the connection
       string, password and all. */
    const message = error instanceof Error ? error.message : String(error);
    fail(message.replace(/postgres(ql)?:\/\/[^\s]+/g, "postgres://[hidden]"));
  });
}
