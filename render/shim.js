// Minimal stand-in for the Hatchable SDK: Postgres via DATABASE_URL, config via env vars.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_URL;
export const pool = new pg.Pool({
  connectionString: url,
  max: 8,
  ssl: url && /\.render\.com/.test(url) ? { rejectUnauthorized: false } : false,
  statement_timeout: 15000
});

export const db = {
  query: (sql, params) => pool.query(sql, params)
};

export const config = {
  async get(name) {
    const v = process.env[name];
    if (v === undefined || v === "") throw new Error("Config value not set: " + name);
    return v;
  }
};

export const api = {
  // Per-user OAuth connectors are a Hatchable feature; in this host they report "not connected".
  async call(name) {
    const e = new Error("API \"" + name + "\" is not connected (setup required)");
    e.code = "SetupRequired";
    throw e;
  }
};

export async function runMigrations() {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  await pool.query("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const files = (await fs.readdir(dir)).filter(f => f.endsWith(".sql")).sort();
  for (const f of files) {
    const done = await pool.query("SELECT 1 FROM _migrations WHERE name=$1", [f]);
    if (done.rows.length) continue;
    const sql = await fs.readFile(path.join(dir, f), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (sql.trim()) await client.query(sql);
      await client.query("INSERT INTO _migrations(name) VALUES($1)", [f]);
      await client.query("COMMIT");
      console.log("migration applied:", f);
    } catch (e) {
      await client.query("ROLLBACK");
      throw new Error("Migration " + f + " failed: " + e.message);
    } finally {
      client.release();
    }
  }
}
