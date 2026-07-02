/**
 * DNJ Exchange — D1 Database Helper
 *
 * Thin wrapper around Cloudflare D1 that mirrors the interface
 * previously used with node-postgres (pg), returning { rows: [] } objects.
 *
 * Key differences from PostgreSQL / pg:
 *  - Placeholders are ? instead of $1, $2, ...
 *  - Arrays are stored as JSON strings — parse/stringify on read/write.
 *  - No connection pool (D1 handles that internally).
 *  - Transactions: use db.tx(async (txDb) => { ... })
 */

/**
 * Parse a value from D1 storage.
 * JSON array columns come back as strings like '["A-1","B-2"]'.
 */
export function parseArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

/**
 * Serialize an array for D1 storage.
 */
export function serializeArray(arr) {
  return JSON.stringify(Array.isArray(arr) ? arr : []);
}

/**
 * Normalise a row from D1 — convert JSON array columns back to real arrays.
 */
function normaliseRow(row) {
  if (!row) return null;
  const out = { ...row };
  // These columns are stored as JSON in D1
  for (const col of ['offers', 'wants', 'zones_a_gives', 'zones_b_gives']) {
    if (col in out) out[col] = parseArray(out[col]);
  }
  return out;
}

/**
 * Simple query helper.
 * Returns { rows: Array } to match pg interface.
 */
export async function query(DB, sql, params = []) {
  const stmt = DB.prepare(sql).bind(...params);
  const { results } = await stmt.all();
  return { rows: (results || []).map(normaliseRow), rowCount: results?.length ?? 0 };
}

/**
 * Query a single row.
 * Returns { rows: [row] } or { rows: [] }
 */
export async function queryOne(DB, sql, params = []) {
  const stmt = DB.prepare(sql).bind(...params);
  const row = await stmt.first();
  return { rows: row ? [normaliseRow(row)] : [], rowCount: row ? 1 : 0 };
}

/**
 * Execute a write statement (INSERT/UPDATE/DELETE).
 * Returns { rowCount: number, lastInsertRowid: number|bigint }
 */
export async function run(DB, sql, params = []) {
  const stmt = DB.prepare(sql).bind(...params);
  const meta = await stmt.run();
  return {
    rowCount: meta.meta?.changes ?? 0,
    lastInsertRowid: meta.meta?.last_row_id ?? null,
  };
}

/**
 * Execute a write statement and return the modified row (for INSERT RETURNING).
 * D1 doesn't support RETURNING — we simulate it with a follow-up SELECT.
 */
export async function runReturning(DB, sql, params, selectSql, selectParams) {
  await run(DB, sql, params);
  return queryOne(DB, selectSql, selectParams);
}

/**
 * Execute multiple statements in a batch (D1 transaction).
 * Pass an async callback that receives a txDB object.
 * The txDB has the same `query`, `queryOne`, `run` methods but batches all
 * statements and executes them atomically.
 *
 * Example:
 *   await tx(DB, async (t) => {
 *     await t.run('UPDATE matches SET status=? WHERE id=?', ['completed', id]);
 *     await t.run('UPDATE requests SET status=? WHERE id=?', ['completed', reqId]);
 *   });
 */
export async function tx(DB, callback) {
  const stmts = [];

  const txProxy = {
    run: (sql, params = []) => {
      stmts.push(DB.prepare(sql).bind(...params));
      return Promise.resolve({ rowCount: 0 });
    },
    // For reads inside a transaction, fall through to DB directly
    query: (sql, params = []) => query(DB, sql, params),
    queryOne: (sql, params = []) => queryOne(DB, sql, params),
  };

  await callback(txProxy);

  if (stmts.length > 0) {
    await DB.batch(stmts);
  }
}
