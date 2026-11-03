const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
const { createApplication } = require("../server");

const adminUsername = "travel-admin";
const adminPassword = "a-long-test-password";
const contentOverride = {
  en: { "trip.ala.price": "from $1,100" },
};
const catalogOverride = {
  tours: [
    {
      id: "custom-route",
      tags: ["trekking"],
      fields: Object.fromEntries(
        ["en", "ru", "ky"].map((language) => [
          language,
          {
            label: "CUSTOM ROUTE",
            location: "NARYN · 2 DAYS",
            title: "Custom route",
            price: "from $240 / traveler",
            activity: "Guided trek",
            season: "Summer",
            description: "A test route.",
            includes: "Guide and yurt.",
            alt: "Mountains in Naryn",
          },
        ]),
      ),
      image: {
        url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a4/Test.jpg/960px-Test.jpg",
        credit: "Test photographer",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Test.jpg",
        license: "CC BY 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      },
    },
  ],
  experiences: [],
};

let server;
let contentFile;
let catalogFile;
let origin;
let temporaryDirectory;
let telegramCalls;

async function startServer() {
  const application = createApplication({
    adminUsername,
    adminPassword,
    contentFile,
    catalogFile,
    telegramBotToken: "test-bot-token",
    telegramChatId: "-100123456",
    telegramApiBase: "https://telegram.test",
    fetchImpl: async (url, options) => {
      telegramCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      };
    },
  });
  server = application.server;
  await application.loadContent();
  await application.loadCatalog();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
}

async function signIn(username = adminUsername, password = adminPassword) {
  const response = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ username, password }),
  });
  return response;
}

async function getCsrfToken(cookie) {
  const response = await fetch(`${origin}/api/admin/session`, {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  return (await response.json()).csrfToken;
}

beforeEach(async () => {
  telegramCalls = [];
  temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "travelhorizon-test-"),
  );
  contentFile = path.join(temporaryDirectory, "content.json");
  catalogFile = path.join(temporaryDirectory, "catalog.json");
  await startServer();
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

test("admin route shows sign-in until a valid admin session exists", async () => {
  const loginPage = await fetch(`${origin}/admin.html`);
  assert.equal(loginPage.status, 200);
  assert.equal(loginPage.headers.get("cache-control"), "no-store");
  const loginHtml = await loginPage.text();
  assert.match(loginHtml, /id="admin-login-form"/);
  assert.match(loginHtml, /Login name/);
  assert.match(loginHtml, /name="username"/);
  assert.match(loginHtml, /name="password"/);
  assert.doesNotMatch(loginHtml, /id="admin-content-form"|Shared site content/);

  const invalidLogin = await signIn(adminUsername, "wrong-password");
  assert.equal(invalidLogin.status, 401);

  const stillLocked = await fetch(`${origin}/admin.html`);
  const stillLockedHtml = await stillLocked.text();
  assert.match(stillLockedHtml, /id="admin-login-form"/);
  assert.doesNotMatch(stillLockedHtml, /id="admin-content-form"|Shared site content/);

  const login = await signIn();
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);

  const adminPage = await fetch(`${origin}/admin.html`, {
    headers: { Cookie: cookie },
  });
  const adminHtml = await adminPage.text();
  assert.match(adminHtml, /id="admin-content-form"/);
  assert.match(adminHtml, /Shared site content/);
  assert.doesNotMatch(adminHtml, /id="admin-login-form"/);
});

test("content writes require an admin session and CSRF token and persist", async () => {
  const unauthenticated = await fetch(`${origin}/api/admin/content`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ content: contentOverride }),
  });
  assert.equal(unauthenticated.status, 401);

  const login = await signIn();
  const cookie = login.headers.get("set-cookie");
  const csrfToken = await getCsrfToken(cookie);
  const rejectedWrite = await fetch(`${origin}/api/admin/content`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: origin,
    },
    body: JSON.stringify({ content: contentOverride }),
  });
  assert.equal(rejectedWrite.status, 403);

  const write = await fetch(`${origin}/api/admin/content`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: origin,
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ content: contentOverride }),
  });
  assert.equal(write.status, 200);
  assert.deepEqual(await (await fetch(`${origin}/api/content`)).json(), contentOverride);
  assert.deepEqual(JSON.parse(await fs.readFile(contentFile, "utf8")), contentOverride);

  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  server = undefined;
  await startServer();
  assert.deepEqual(await (await fetch(`${origin}/api/content`)).json(), contentOverride);
});

test("catalog changes require an admin session, validate photos, and persist", async () => {
  const unauthenticated = await fetch(`${origin}/api/admin/catalog`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ catalog: catalogOverride }),
  });
  assert.equal(unauthenticated.status, 401);

  const login = await signIn();
  const cookie = login.headers.get("set-cookie");
  const missingCsrf = await fetch(`${origin}/api/admin/catalog`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: origin,
    },
    body: JSON.stringify({ catalog: catalogOverride }),
  });
  assert.equal(missingCsrf.status, 403);

  const csrfToken = await getCsrfToken(cookie);
  const invalidCatalog = structuredClone(catalogOverride);
  invalidCatalog.tours[0].image.url = "https://images.example.com/photo.jpg";
  const rejected = await fetch(`${origin}/api/admin/catalog`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: origin,
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ catalog: invalidCatalog }),
  });
  assert.equal(rejected.status, 400);

  const saved = await fetch(`${origin}/api/admin/catalog`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: origin,
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ catalog: catalogOverride }),
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(
    (await (await fetch(`${origin}/api/catalog`)).json()).catalog,
    catalogOverride,
  );
  assert.deepEqual(JSON.parse(await fs.readFile(catalogFile, "utf8")), catalogOverride);

  const contact = await fetch(`${origin}/api/contact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({
      name: "Catalog Test",
      email: "catalog@example.com",
      tour: "custom-route",
      travelers: "1",
      interest: "general",
      message: "",
      language: "en",
    }),
  });
  assert.equal(contact.status, 200);
  assert.match(JSON.parse(telegramCalls[0].options.body).text, /Tour: Custom route/);
  assert.match(JSON.parse(telegramCalls[0].options.body).text, /\$240/);

  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  server = undefined;
  await startServer();
  assert.deepEqual(
    (await (await fetch(`${origin}/api/catalog`)).json()).catalog,
    catalogOverride,
  );
});

test("rejects cross-origin login and does not expose backend files", async () => {
  const rejectedLogin = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://attacker.example",
    },
    body: JSON.stringify({ username: adminUsername, password: adminPassword }),
  });
  assert.equal(rejectedLogin.status, 403);

  const serverSource = await fetch(`${origin}/server.js`);
  assert.equal(serverSource.status, 404);
  const storedData = await fetch(`${origin}/data/content.json`);
  assert.equal(storedData.status, 404);
});

test("content policy allows the licensed Wikimedia image hosts only", async () => {
  const response = await fetch(`${origin}/tours.html`);
  const policy = response.headers.get("content-security-policy");
  assert.match(
    policy,
    /img-src 'self' https:\/\/thumb\.wikimedia\.org https:\/\/upload\.wikimedia\.org/,
  );
  assert.doesNotMatch(policy, /unsplash/i);
});

test("limits repeated failed sign-in attempts", async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await signIn(adminUsername, "wrong-password");
    assert.equal(response.status, 401);
  }
  const throttled = await signIn();
  assert.equal(throttled.status, 429);
});

test("sends validated contact enquiries to the configured Telegram chat", async () => {
  const response = await fetch(`${origin}/api/contact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({
      name: "Aida Example",
      email: "aida@example.com",
      tour: "ala",
      travelers: "2",
      interest: "general",
      message: "We are interested in September dates.",
      language: "en",
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: true });
  assert.equal(telegramCalls.length, 1);
  assert.equal(
    telegramCalls[0].url,
    "https://telegram.test/bottest-bot-token/sendMessage",
  );
  assert.deepEqual(JSON.parse(telegramCalls[0].options.body), {
    chat_id: "-100123456",
    text: [
      "New TravelHorizon enquiry",
      "Name: Aida Example",
      "Email: aida@example.com",
      "Tour: Ala-Archa, on foot",
      "Travelers: 2",
      "Interested in: A trip to Kyrgyzstan",
      "Message: We are interested in September dates.",
      "Indicative starting total (not a quote): $140",
    ].join("\n"),
    disable_web_page_preview: true,
  });
});

test("accepts researched tour IDs without inventing unpublished prices", async () => {
  const response = await fetch(`${origin}/api/contact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({
      name: "Aida Example",
      email: "aida@example.com",
      tour: "kelsuu",
      travelers: 2,
      interest: "canyon",
      message: "",
      language: "en",
    }),
  });

  assert.equal(response.status, 200);
  const text = JSON.parse(telegramCalls[0].options.body).text;
  assert.match(text, /Tour: Kel-Suu by horseback/);
  assert.match(text, /Interested in: Canyons and waterfalls/);
  assert.doesNotMatch(text, /starting total|Estimated total/i);
});

test("validates enquiries and rejects cross-origin submissions", async () => {
  const rejectedOrigin = await fetch(`${origin}/api/contact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://attacker.example",
    },
    body: JSON.stringify({}),
  });
  assert.equal(rejectedOrigin.status, 403);

  const invalidEmail = await fetch(`${origin}/api/contact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({
      name: "Aida",
      email: "not-an-email",
      travelers: 1,
      interest: "general",
      language: "en",
    }),
  });
  assert.equal(invalidEmail.status, 400);
  assert.equal(telegramCalls.length, 0);

  const removedTour = await fetch(`${origin}/api/contact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({
      name: "Aida",
      email: "aida@example.com",
      tour: "jyrgalan",
      travelers: 1,
      interest: "general",
      language: "en",
    }),
  });
  assert.equal(removedTour.status, 400);
  assert.equal(telegramCalls.length, 0);
});

test("rate limits contact enquiries", async () => {
  const enquiry = {
    name: "Aida",
    email: "aida@example.com",
    travelers: 1,
    interest: "general",
    language: "en",
  };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`${origin}/api/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify(enquiry),
    });
    assert.equal(response.status, 200);
  }
  const throttled = await fetch(`${origin}/api/contact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify(enquiry),
  });
  assert.equal(throttled.status, 429);
  assert.equal(telegramCalls.length, 5);
});
