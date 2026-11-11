// Local dev D1 helper. `npm run dev` binds DB to a local "site-creator-d1"
// database but never applies migrations, so a fresh checkout has no tables.
//   node scripts/d1-local.mjs migrate
//   node scripts/d1-local.mjs sql "SELECT * FROM ussd_phones"
//   node scripts/d1-local.mjs link-sim +999000001 pocket.alice.near
// Local only: this never touches a remote database.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const [command, ...args] = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), "porti-d1-"));
const config = join(dir, "wrangler.json");
writeFileSync(config, JSON.stringify({
  name: "porti-local",
  main: join(root, "worker/index.ts"),
  compatibility_date: "2026-11-01",
  d1_databases: [{
    binding: "DB",
    database_name: "site-creator-d1",
    database_id: "00000000-0000-4000-8000-000000000000",
    migrations_dir: join(root, "drizzle"),
  }],
}));
const wrangler = (...a) => spawnSync(process.execPath, [
  join(root, "node_modules/wrangler/bin/wrangler.js"), "d1", ...a, "site-creator-d1",
  "--local", "--persist-to", join(root, ".wrangler/state"), "--config", config,
], { stdio: "inherit", cwd: root, env: { ...process.env, CI: "1" } });

let result;
try {
  if (command === "migrate") result = wrangler("migrations", "apply");
  else if (command === "sql" && args[0]) result = wrangler("execute", "--command", args[0]);
  else if (command === "link-sim" && /^\+999\d{5,12}$/.test(args[0] || "") && /^[a-z0-9._-]{2,64}$/.test(args[1] || "")) {
    result = wrangler("execute", "--command",
      `INSERT OR REPLACE INTO ussd_phones (phone,pocket_id,channel,created_at) VALUES ('${args[0]}','${args[1]}','simulator',${Date.now()})`);
  } else {
    console.error("Usage: d1-local.mjs migrate | sql \"<SQL>\" | link-sim +999XXXXXX <pocket-account>");
    result = { status: 2 };
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(result.status ?? 1);
