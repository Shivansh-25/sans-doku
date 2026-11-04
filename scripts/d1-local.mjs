import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function localDatabase(path = ":memory:") {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  for (const file of [
    "0001_metrics.sql",
    "0002_daily_time.sql",
    "0003_admin_login.sql",
    "0004_account_finishes.sql",
  ])
    db.exec(
      readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"),
    );
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return { sql, args };
        },
      };
    },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = statements.map(({ sql, args }) => {
          const stmt = db.prepare(sql);
          const read = /^\s*SELECT/i.test(sql) || /\bRETURNING\b/i.test(sql);
          return {
            results: read ? stmt.all(...args) : (stmt.run(...args), []),
            success: true,
          };
        });
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
}
