if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const path = require("node:path");
const {
  createPool,
  initializeDatabase,
  migrateJsonSeeds,
} = require("../database");
const { normalizeCatalog, normalizeContent } = require("../server");

async function main() {
  let pool;
  try {
    pool = createPool();
    await initializeDatabase(pool);
    const result = await migrateJsonSeeds(pool, {
      contentFile: path.join(__dirname, "..", "data", "content.json"),
      catalogFile: path.join(__dirname, "..", "data", "catalog.json"),
      normalizeContent,
      normalizeCatalog,
    });
    console.log(
      result.applied
        ? "JSON seed data imported into PostgreSQL."
        : "JSON seed migration was already applied; database content was left unchanged.",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}

void main();
