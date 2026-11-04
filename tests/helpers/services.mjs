import fs from "node:fs";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";
import { consumeLimit, responseJSON } from "../../lib/request-guard.mjs";
export function load(file, deps, names) {
  const injected = { responseJSON, consumeLimit, ...deps };
  if (deps.fetch) {
    injected.fetch = async (...args) => {
      const r = await deps.fetch(...args);
      return r instanceof Response
        ? r
        : Response.json(await r.json(), { status: r.status || 200 });
    };
  }
  const result = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
    reportDiagnostics: true,
  });
  if (
    result.diagnostics?.some((d) => d.category === ts.DiagnosticCategory.Error)
  )
    throw Error("TypeScript syntax error in " + file);
  const code = result.outputText
    .replace(/^import[\s\S]*?;\s*$/gm, "")
    .replace(/^export /gm, "");
  return new Function(
    ...Object.keys(injected),
    code + "\nreturn {" + names.join(",") + "};",
  )(...Object.values(injected));
}
export function database({
  beforeAll,
  beforeFirst,
  beforeRun,
  beforeBatch,
} = {}) {
  const sql = new DatabaseSync(":memory:");
  for (const p of fs
    .readdirSync("drizzle")
    .filter((x) => x.endsWith(".sql"))
    .sort())
    sql.exec(fs.readFileSync("drizzle/" + p, "utf8"));
  const adapter = {
    async batch(statements) {
      beforeBatch?.(sql);
      sql.exec("BEGIN");
      try {
        const results = statements.map((s) => s._run());
        sql.exec("COMMIT");
        return results;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
    prepare(q) {
      return {
        bind(...v) {
          return statement(v);
        },
        ...statement([]),
      };
      function statement(v) {
        return {
          async first() {
            beforeFirst?.(q, v, sql);
            return sql.prepare(q).get(...v) || null;
          },
          async all() {
            beforeAll?.(q, v, sql);
            return { results: sql.prepare(q).all(...v) };
          },
          _run() {
            beforeRun?.(q, v, sql);
            return {
              meta: { changes: Number(sql.prepare(q).run(...v).changes) },
            };
          },
          async run() {
            return this._run();
          },
        };
      }
    },
  };
  return { sql, adapter };
}
