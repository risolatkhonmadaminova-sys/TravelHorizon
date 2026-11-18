const fs = require("node:fs/promises");
const { Pool } = require("pg");

const migrationName = "json-content-v1";

function createPool(databaseUrl = process.env.DATABASE_URL) {
  if (typeof databaseUrl !== "string" || !databaseUrl.trim()) {
    throw new Error("DATABASE_URL must be configured to use PostgreSQL.");
  }
  return new Pool({ connectionString: databaseUrl });
}

async function inTransaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function initializeDatabase(pool) {
  await inTransaction(pool, async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS site_content (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        content JSONB NOT NULL CHECK (jsonb_typeof(content) = 'object'),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_state (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        enabled BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await client.query(`
      INSERT INTO catalog_state (id, enabled)
      VALUES (1, FALSE)
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_items (
        id VARCHAR(40) PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('tour', 'experience')),
        sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
        tags TEXT[] NOT NULL DEFAULT '{}',
        fields JSONB NOT NULL CHECK (jsonb_typeof(fields) = 'object'),
        image JSONB NOT NULL CHECK (jsonb_typeof(image) = 'object'),
        topic TEXT,
        listing_url TEXT,
        UNIQUE (kind, sort_order),
        CHECK (
          (kind = 'tour' AND cardinality(tags) > 0 AND topic IS NULL AND listing_url IS NULL)
          OR
          (kind = 'experience' AND cardinality(tags) = 0 AND topic IS NOT NULL)
        )
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  });
}

async function assertJsonMigrationApplied(pool) {
  const migration = await pool.query(
    "SELECT name FROM schema_migrations WHERE name = $1",
    [migrationName],
  );
  if (!migration.rowCount) {
    throw new Error(
      "The JSON seed migration has not been applied. Run `npm run db:migrate` before starting the server.",
    );
  }
}

async function readSeedFile(filePath, label) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not read the ${label} JSON migration seed at ${filePath}: ${error.message}`,
    );
  }
}

async function migrateJsonSeeds(
  pool,
  {
    contentFile,
    catalogFile,
    normalizeContent,
    normalizeCatalog,
  },
) {
  return inTransaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [738194621]);
    const existing = await client.query(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [migrationName],
    );
    if (existing.rowCount) return { applied: false };

    const [contentSeed, catalogSeed] = await Promise.all([
      readSeedFile(contentFile, "content"),
      readSeedFile(catalogFile, "catalog"),
    ]);
    const content = normalizeContent(contentSeed);
    const catalog = normalizeCatalog(catalogSeed);

    await client.query(
      `INSERT INTO site_content (id, content)
       VALUES (1, $1::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(content)],
    );

    for (const [kind, entries] of [
      ["tour", catalog.tours],
      ["experience", catalog.experiences],
    ]) {
      for (const [sortOrder, entry] of entries.entries()) {
        await client.query(
          `INSERT INTO catalog_items
            (id, kind, sort_order, tags, fields, image, topic, listing_url)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [
            entry.id,
            kind,
            sortOrder,
            entry.tags || [],
            JSON.stringify(entry.fields),
            JSON.stringify(entry.image),
            entry.topic || null,
            entry.listingUrl || null,
          ],
        );
      }
    }

    await client.query(
      `UPDATE catalog_state
       SET enabled = enabled OR EXISTS (SELECT 1 FROM catalog_items)
       WHERE id = 1`,
    );
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
      migrationName,
    ]);
    return { applied: true };
  });
}

function createContentStore(pool) {
  return {
    async getContent() {
      const { rows } = await pool.query(
        "SELECT content FROM site_content WHERE id = 1",
      );
      return rows[0]?.content || {};
    },

    async setContent(content) {
      await pool.query(
        `INSERT INTO site_content (id, content, updated_at)
         VALUES (1, $1::jsonb, NOW())
         ON CONFLICT (id)
         DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
        [JSON.stringify(content)],
      );
    },

    async getCatalog() {
      const state = await pool.query(
        "SELECT enabled FROM catalog_state WHERE id = 1",
      );
      if (!state.rows[0]?.enabled) return null;

      const { rows } = await pool.query(
        `SELECT id, kind, tags, fields, image, topic, listing_url
         FROM catalog_items
         ORDER BY kind, sort_order`,
      );
      const catalog = { tours: [], experiences: [] };
      for (const row of rows) {
        const entry = {
          id: row.id,
          fields: row.fields,
          image: row.image,
        };
        if (row.kind === "tour") {
          entry.tags = row.tags;
          catalog.tours.push(entry);
        } else {
          entry.topic = row.topic;
          entry.listingUrl = row.listing_url;
          catalog.experiences.push(entry);
        }
      }
      return catalog;
    },

    async replaceCatalog(catalog) {
      await inTransaction(pool, async (client) => {
        await client.query("DELETE FROM catalog_items");
        for (const [kind, entries] of [
          ["tour", catalog.tours],
          ["experience", catalog.experiences],
        ]) {
          for (const [sortOrder, entry] of entries.entries()) {
            await client.query(
              `INSERT INTO catalog_items
                (id, kind, sort_order, tags, fields, image, topic, listing_url)
               VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
              [
                entry.id,
                kind,
                sortOrder,
                entry.tags || [],
                JSON.stringify(entry.fields),
                JSON.stringify(entry.image),
                entry.topic || null,
                entry.listingUrl || null,
              ],
            );
          }
        }
        await client.query(
          "UPDATE catalog_state SET enabled = TRUE WHERE id = 1",
        );
      });
    },

    async clearCatalog() {
      await inTransaction(pool, async (client) => {
        await client.query("DELETE FROM catalog_items");
        await client.query(
          "UPDATE catalog_state SET enabled = FALSE WHERE id = 1",
        );
      });
    },
  };
}

module.exports = {
  createContentStore,
  createPool,
  assertJsonMigrationApplied,
  initializeDatabase,
  migrateJsonSeeds,
};
