const assert = require("node:assert/strict");
const http = require("node:http");
const { test } = require("node:test");

process.env.VERCEL = "1";
process.env.BLOB_READ_WRITE_TOKEN = "";
process.env.ADMIN_USERNAME = "";
process.env.ADMIN_PASSWORD = "";
process.env.TELEGRAM_BOT_TOKEN = "";
process.env.TELEGRAM_CHAT_ID = "";

const handler = require("../api/[...route]");

test("Vercel API function serves public JSON and safely disables unconfigured services", async () => {
  const server = http.createServer((request, response) => {
    void handler(request, response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const secureOrigin = `https://127.0.0.1:${server.address().port}`;

  try {
    const content = await fetch(`${origin}/api/content`);
    assert.equal(content.status, 200);
    assert.match(content.headers.get("content-type"), /application\/json/);
    assert.equal(typeof (await content.json()), "object");

    const catalog = await fetch(`${origin}/api/catalog`);
    assert.equal(catalog.status, 200);
    const result = await catalog.json();
    assert.ok(Array.isArray(result.catalog.tours));
    assert.ok(Array.isArray(result.catalog.experiences));

    const contact = await fetch(`${origin}/api/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: secureOrigin,
      },
      body: JSON.stringify({
        name: "Aida Example",
        email: "aida@example.com",
        travelers: 1,
        interest: "general",
      }),
    });
    assert.equal(contact.status, 503);
    assert.equal(typeof (await contact.json()).error, "string");

    const login = await fetch(`${origin}/api/admin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: secureOrigin,
      },
      body: JSON.stringify({ username: "admin", password: "not-configured" }),
    });
    assert.equal(login.status, 503);
    assert.equal(typeof (await login.json()).error, "string");

    const session = await fetch(`${origin}/api/admin/session`);
    assert.equal(session.status, 503);
    assert.equal(typeof (await session.json()).error, "string");

    for (const [pathname, method, body] of [
      ["/api/admin/content", "PUT", { content: { en: {} } }],
      ["/api/admin/catalog", "PUT", { catalog: result.catalog }],
      ["/api/admin/logout", "POST"],
    ]) {
      const response = await fetch(`${origin}${pathname}`, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          Origin: secureOrigin,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(response.status, 503, pathname);
      assert.equal(typeof (await response.json()).error, "string");
    }

    const unknown = await fetch(`${origin}/api/not-a-real-endpoint`);
    assert.equal(unknown.status, 404);
    assert.equal(typeof (await unknown.json()).error, "string");
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
