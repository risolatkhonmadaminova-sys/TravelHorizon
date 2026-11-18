const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { after, test } = require("node:test");
const {
  assertJsonMigrationApplied,
  createContentStore,
  createPool,
  initializeDatabase,
  migrateJsonSeeds,
} = require("../database");
const { normalizeCatalog, normalizeContent } = require("../server");
const seedCatalog = require("../data/catalog.json");
const seedContent = require("../data/content.json");

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const pools = [];

after(async () => {
  await Promise.all(pools.map((pool) => pool.end()));
});

test("requires a PostgreSQL connection URL", () => {
  assert.throws(() => createPool(""), /DATABASE_URL must be configured/);
});

test(
  "initializes PostgreSQL, imports JSON once, and persists API CRUD",
  { skip: !testDatabaseUrl },
  async () => {
    const schema = `travelhorizon_test_${process.pid}_${randomBytes(4).toString("hex")}`;
    const setupPool = createPool(testDatabaseUrl);
    pools.push(setupPool);
    await setupPool.query(`CREATE SCHEMA ${schema}`);

    const scopedUrl = new URL(testDatabaseUrl);
    scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
    const pool = createPool(scopedUrl.toString());
    pools.push(pool);
    let server;

    try {
      await initializeDatabase(pool);
      await initializeDatabase(pool);
      await assert.rejects(
        assertJsonMigrationApplied(pool),
        /JSON seed migration has not been applied/,
      );
      const migrationOptions = {
        contentFile: require.resolve("../data/content.json"),
        catalogFile: require.resolve("../data/catalog.json"),
        normalizeContent,
        normalizeCatalog,
      };
      assert.deepEqual(await migrateJsonSeeds(pool, migrationOptions), {
        applied: true,
      });
      await assertJsonMigrationApplied(pool);

      const store = createContentStore(pool);
      assert.deepEqual(await store.getContent(), normalizeContent(seedContent));
      assert.deepEqual(await store.getCatalog(), normalizeCatalog(seedCatalog));
      assert.deepEqual(await migrateJsonSeeds(pool, migrationOptions), {
        applied: false,
      });
      const itemCount = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM catalog_items",
      );
      assert.equal(itemCount.rows[0].count, 12);

      const application = require("../server").createApplication({
        store,
        adminUsername: "test-admin",
        adminPassword: "a-long-test-password",
        telegramBotToken: "",
        telegramChatId: "",
      });
      server = application.server;
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const origin = `http://127.0.0.1:${server.address().port}`;

      const publicContent = await fetch(`${origin}/api/content`);
      assert.equal(publicContent.status, 200);
      assert.deepEqual(await publicContent.json(), normalizeContent(seedContent));
      const publicCatalog = await fetch(`${origin}/api/catalog`);
      assert.equal(publicCatalog.status, 200);
      assert.deepEqual(
        (await publicCatalog.json()).catalog,
        normalizeCatalog(seedCatalog),
      );

      const login = await fetch(`${origin}/api/admin/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
        },
        body: JSON.stringify({
          username: "test-admin",
          password: "a-long-test-password",
        }),
      });
      assert.equal(login.status, 200);
      const cookie = login.headers.get("set-cookie").split(";")[0];
      const session = await fetch(`${origin}/api/admin/session`, {
        headers: { Cookie: cookie },
      });
      const { csrfToken } = await session.json();
      const adminHeaders = {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: origin,
        "X-CSRF-Token": csrfToken,
      };

      const contentOverride = { en: { "trip.ala.price": "from $999" } };
      const savedContent = await fetch(`${origin}/api/admin/content`, {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({ content: contentOverride }),
      });
      assert.equal(savedContent.status, 200);
      assert.deepEqual(
        await (await fetch(`${origin}/api/content`)).json(),
        contentOverride,
      );

      const editedCatalog = normalizeCatalog(seedCatalog);
      const addedTour = structuredClone(editedCatalog.tours[0]);
      addedTour.id = "database-test-tour";
      editedCatalog.tours.push(addedTour);
      editedCatalog.tours[0].fields.en.price = "from $999";
      const savedCatalog = await fetch(`${origin}/api/admin/catalog`, {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({ catalog: editedCatalog }),
      });
      assert.equal(savedCatalog.status, 200);
      let actualCatalog = (await (
        await fetch(`${origin}/api/catalog`)
      ).json()).catalog;
      assert.equal(actualCatalog.tours.length, 7);
      assert.equal(actualCatalog.tours[0].fields.en.price, "from $999");
      assert.equal(actualCatalog.tours[6].id, "database-test-tour");

      editedCatalog.tours = editedCatalog.tours.filter(
        (entry) => entry.id !== "database-test-tour",
      );
      const deletedTour = await fetch(`${origin}/api/admin/catalog`, {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({ catalog: editedCatalog }),
      });
      assert.equal(deletedTour.status, 200);
      actualCatalog = (await (
        await fetch(`${origin}/api/catalog`)
      ).json()).catalog;
      assert.equal(actualCatalog.tours.length, 6);
      assert.equal(
        actualCatalog.tours.some((entry) => entry.id === "database-test-tour"),
        false,
      );

      const reset = await fetch(`${origin}/api/admin/content`, {
        method: "DELETE",
        headers: adminHeaders,
      });
      assert.equal(reset.status, 200);
      assert.deepEqual(await store.getContent(), {});

      const cleared = await fetch(`${origin}/api/admin/catalog`, {
        method: "DELETE",
        headers: adminHeaders,
      });
      assert.equal(cleared.status, 200);
      assert.equal(await store.getCatalog(), null);
      assert.deepEqual(await migrateJsonSeeds(pool, migrationOptions), {
        applied: false,
      });
      assert.equal(await store.getCatalog(), null);
    } finally {
      if (server?.listening) {
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
      await pool.end();
      pools.splice(pools.indexOf(pool), 1);
      await setupPool.query(`DROP SCHEMA ${schema} CASCADE`);
      await setupPool.end();
      pools.splice(pools.indexOf(setupPool), 1);
    }
  },
);
