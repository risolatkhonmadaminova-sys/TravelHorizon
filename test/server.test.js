const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
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

  const csrfToken = await getCsrfToken(cookie);
  const logout = await fetch(`${origin}/api/admin/logout`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "X-CSRF-Token": csrfToken,
    },
  });
  assert.equal(logout.status, 200);
  const loggedOutSession = await fetch(`${origin}/api/admin/session`, {
    headers: { Cookie: cookie },
  });
  assert.equal(loggedOutSession.status, 401);
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

  const restartedLogin = await signIn();
  const restartedCookie = restartedLogin.headers.get("set-cookie");
  const restartedCsrfToken = await getCsrfToken(restartedCookie);
  const reset = await fetch(`${origin}/api/admin/content`, {
    method: "DELETE",
    headers: {
      Cookie: restartedCookie,
      Origin: origin,
      "X-CSRF-Token": restartedCsrfToken,
    },
  });
  assert.equal(reset.status, 200);
  assert.deepEqual(await (await fetch(`${origin}/api/content`)).json(), {});
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

  const restartedLogin = await signIn();
  const restartedCookie = restartedLogin.headers.get("set-cookie");
  const restartedCsrfToken = await getCsrfToken(restartedCookie);
  const reset = await fetch(`${origin}/api/admin/catalog`, {
    method: "DELETE",
    headers: {
      Cookie: restartedCookie,
      Origin: origin,
      "X-CSRF-Token": restartedCsrfToken,
    },
  });
  assert.equal(reset.status, 200);
  assert.deepEqual(await (await fetch(`${origin}/api/catalog`)).json(), {
    catalog: null,
  });
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

test("public APIs work without environment configuration and admin remains disabled", async () => {
  const application = createApplication({
    adminUsername: "",
    adminPassword: "",
    telegramBotToken: "",
    telegramChatId: "",
  });
  await Promise.all([application.loadContent(), application.loadCatalog()]);
  const unconfiguredServer = application.server;
  await new Promise((resolve) =>
    unconfiguredServer.listen(0, "127.0.0.1", resolve),
  );
  const unconfiguredOrigin = `http://127.0.0.1:${unconfiguredServer.address().port}`;

  try {
    const contentResponse = await fetch(`${unconfiguredOrigin}/api/content`);
    assert.equal(contentResponse.status, 200);
    assert.match(contentResponse.headers.get("content-type"), /application\/json/);
    assert.deepEqual(await contentResponse.json(), {
      en: {},
      ru: {},
      ky: {},
    });

    const catalogResponse = await fetch(`${unconfiguredOrigin}/api/catalog`);
    assert.equal(catalogResponse.status, 200);
    const catalogResult = await catalogResponse.json();
    assert.ok(Array.isArray(catalogResult.catalog.tours));
    assert.ok(Array.isArray(catalogResult.catalog.experiences));

    const adminRequests = [
      ["/api/admin/login", "POST", { username: "admin", password: adminPassword }],
      ["/api/admin/session", "GET"],
      ["/api/admin/content", "PUT", { content: contentOverride }],
      ["/api/admin/content", "DELETE"],
      ["/api/admin/catalog", "PUT", { catalog: catalogOverride }],
      ["/api/admin/catalog", "DELETE"],
      ["/api/admin/logout", "POST"],
    ];
    for (const [pathname, method, body] of adminRequests) {
      const response = await fetch(`${unconfiguredOrigin}${pathname}`, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(method !== "GET" ? { Origin: unconfiguredOrigin } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(response.status, 503, pathname);
      assert.equal(typeof (await response.json()).error, "string");
    }

    const adminPage = await fetch(`${unconfiguredOrigin}/admin.html`);
    assert.equal(adminPage.status, 200);
    const adminPageHtml = await adminPage.text();
    assert.match(adminPageHtml, /id="admin-login-form"/);
    assert.doesNotMatch(adminPageHtml, /id="admin-content-form"/);

    const contactResponse = await fetch(`${unconfiguredOrigin}/api/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: unconfiguredOrigin,
      },
      body: JSON.stringify({
        name: "Aida Example",
        email: "aida@example.com",
        travelers: 1,
        interest: "general",
      }),
    });
    assert.equal(contactResponse.status, 503);
    assert.deepEqual(await contactResponse.json(), {
      code: "TELEGRAM_NOT_CONFIGURED",
      error: "Telegram contact integration is not configured.",
    });
  } finally {
    await new Promise((resolve, reject) =>
      unconfiguredServer.close((error) =>
        error ? reject(error) : resolve(),
      ),
    );
  }
});

test("public APIs return JSON when ignored data files are not deployed", async () => {
  const missingDataDirectory = path.join(temporaryDirectory, "not-deployed");
  const application = createApplication({
    contentFile: path.join(missingDataDirectory, "content.json"),
    catalogFile: path.join(missingDataDirectory, "catalog.json"),
    adminUsername: "",
    adminPassword: "",
    telegramBotToken: "",
    telegramChatId: "",
  });
  await Promise.all([application.loadContent(), application.loadCatalog()]);
  const missingDataServer = application.server;
  await new Promise((resolve) =>
    missingDataServer.listen(0, "127.0.0.1", resolve),
  );
  const missingDataOrigin = `http://127.0.0.1:${missingDataServer.address().port}`;

  try {
    const content = await fetch(`${missingDataOrigin}/api/content`);
    assert.equal(content.status, 200);
    assert.match(content.headers.get("content-type"), /application\/json/);
    assert.deepEqual(await content.json(), {});

    const catalog = await fetch(`${missingDataOrigin}/api/catalog`);
    assert.equal(catalog.status, 200);
    assert.match(catalog.headers.get("content-type"), /application\/json/);
    assert.deepEqual(await catalog.json(), { catalog: null });

    const toursPage = await fetch(`${missingDataOrigin}/tours.html`);
    assert.equal(toursPage.status, 200);
    assert.match(await toursPage.text(), /Ala-Archa, on foot/);
  } finally {
    await new Promise((resolve, reject) =>
      missingDataServer.close((error) =>
        error ? reject(error) : resolve(),
      ),
    );
  }
});

test("server starts without secrets on the Render host and serves its APIs", async () => {
  const projectDirectory = path.join(__dirname, "..");
  const portServer = http.createServer();
  await new Promise((resolve) => portServer.listen(0, "127.0.0.1", resolve));
  const port = portServer.address().port;
  await new Promise((resolve, reject) =>
    portServer.close((error) => (error ? reject(error) : resolve())),
  );

  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectDirectory,
    env: {
      PATH: process.env.PATH || "",
      PORT: String(port),
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    output += chunk;
  });

  try {
    const origin = `http://127.0.0.1:${port}`;
    let response;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (child.exitCode !== null) {
        throw new Error(`Server exited before becoming ready: ${output}`);
      }
      try {
        response = await fetch(`${origin}/api/content`);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    assert.ok(response, `Server did not start: ${output}`);
    assert.match(output, new RegExp(`http://0\\.0\\.0\\.0:${port}`));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { en: {}, ru: {}, ky: {} });

    const catalogResponse = await fetch(`${origin}/api/catalog`);
    assert.equal(catalogResponse.status, 200);
    assert.match(catalogResponse.headers.get("content-type"), /application\/json/);
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
  }
});
