// Sets keys in .dev.vars (gitignored) without touching other lines.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export function setDevVars(values, file = join(resolve(import.meta.dirname, ".."), ".dev.vars")) {
  const keys = Object.keys(values);
  const kept = existsSync(file)
    ? readFileSync(file, "utf8").split("\n").filter((l) => l && !keys.some((k) => l.startsWith(k + "=")))
    : [];
  writeFileSync(file, [...kept, ...keys.map((k) => `${k}=${values[k]}`)].join("\n") + "\n", { mode: 0o600 });
  return file;
}
