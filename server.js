require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const rootDirectory = __dirname;
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};
const staticFiles = new Set([
  "about.html",
  "admin-login.html",
  "admin.html",
  "contacts.html",
  "experiences.html",
  "index.html",
  "partners.html",
  "script.js",
  "styles.css",
  "tours.html",
]);
const sessionCookieName = "travelhorizon_admin";
const sessionLifetimeMs = 12 * 60 * 60 * 1000;
const loginWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 5;
const contactWindowMs = 15 * 60 * 1000;
const maxContactAttempts = 5;
const maxRequestBytes = 256 * 1024;
const maxContentBytes = 128 * 1024;
const languages = new Set(["en", "ru", "ky"]);
const catalogLanguages = ["en", "ru", "ky"];
const tourFields = [
  "label",
  "location",
  "title",
  "price",
  "activity",
  "season",
  "description",
  "includes",
  "alt",
];
const experienceFields = [
  "kicker",
  "title",
  "location",
  "price",
  "copy",
  "includes",
  "alt",
];
const allowedTourTags = new Set(["trekking", "water", "culture"]);
const allowedExperienceTopics = new Set([
  "horse",
  "yurt",
  "trek",
  "canyon",
  "food",
  "eagle",
]);
const allowedImageHosts = new Set([
  "thumb.wikimedia.org",
  "upload.wikimedia.org",
]);

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeCatalogEntry(entry, kind, ids) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`Invalid ${kind} catalog entry.`);
  }
  const { id, fields, image } = entry;
  if (
    typeof id !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,39}$/.test(id) ||
    ids.has(id)
  ) {
    throw new Error(`Invalid or duplicate ${kind} ID.`);
  }
  ids.add(id);

  const expectedFields = kind === "tour" ? tourFields : experienceFields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new Error(`Invalid localized fields for ${kind} "${id}".`);
  }
  const normalizedFields = {};
  for (const language of catalogLanguages) {
    const localized = fields[language];
    if (!localized || typeof localized !== "object" || Array.isArray(localized)) {
      throw new Error(`Missing ${language} content for ${kind} "${id}".`);
    }
    normalizedFields[language] = {};
    for (const field of expectedFields) {
      const text = localized[field];
      if (typeof text !== "string" || text.length > 2000) {
        throw new Error(`Invalid ${language} ${field} for ${kind} "${id}".`);
      }
      const normalizedText = text.trim();
      if (["title", "alt"].includes(field) && !normalizedText) {
        throw new Error(`${language} ${field} is required for ${kind} "${id}".`);
      }
      normalizedFields[language][field] = normalizedText;
    }
  }

  if (!image || typeof image !== "object" || Array.isArray(image)) {
    throw new Error(`Invalid image details for ${kind} "${id}".`);
  }
  let imageUrl;
  try {
    imageUrl = new URL(image.url);
  } catch {
    throw new Error(`Invalid image URL for ${kind} "${id}".`);
  }
  if (
    imageUrl.protocol !== "https:" ||
    !allowedImageHosts.has(imageUrl.hostname)
  ) {
    throw new Error(
      `Images for ${kind} "${id}" must be hosted on Wikimedia Commons.`,
    );
  }
  for (const field of ["credit", "license"]) {
    if (
      typeof image[field] !== "string" ||
      image[field].trim().length > 160
    ) {
      throw new Error(`Invalid image ${field} for ${kind} "${id}".`);
    }
    if (!image.credit.trim() || !image.license.trim()) {
      throw new Error(`Image credit and license are required for ${kind} "${id}".`);
    }
  }
  for (const field of ["sourceUrl", "licenseUrl"]) {
    if (typeof image[field] !== "string" || !isHttpsUrl(image[field])) {
      throw new Error(`Invalid image ${field} for ${kind} "${id}".`);
    }
  }

  const normalized = {
    id,
    fields: normalizedFields,
    image: {
      url: imageUrl.href,
      credit: image.credit.trim(),
      sourceUrl: image.sourceUrl,
      license: image.license.trim(),
      licenseUrl: image.licenseUrl,
    },
  };
  if (kind === "tour") {
    if (
      !Array.isArray(entry.tags) ||
      entry.tags.length === 0 ||
      entry.tags.some((tag) => !allowedTourTags.has(tag)) ||
      new Set(entry.tags).size !== entry.tags.length
    ) {
      throw new Error(`Invalid tour filters for "${id}".`);
    }
    normalized.tags = [...entry.tags];
  } else {
    if (!allowedExperienceTopics.has(entry.topic)) {
      throw new Error(`Invalid experience enquiry topic for "${id}".`);
    }
    if (
      typeof entry.listingUrl !== "string" ||
      (entry.listingUrl !== "" && !isHttpsUrl(entry.listingUrl))
    ) {
      throw new Error(`Invalid operator listing URL for experience "${id}".`);
    }
    normalized.topic = entry.topic;
    normalized.listingUrl = entry.listingUrl;
  }
  return normalized;
}

function normalizeCatalog(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Catalog must be an object with tours and experiences.");
  }
  const normalized = {};
  for (const kind of ["tours", "experiences"]) {
    if (!Array.isArray(value[kind]) || value[kind].length > 50) {
      throw new Error(`Catalog ${kind} must be a list of at most 50 entries.`);
    }
    const ids = new Set();
    normalized[kind] = value[kind].map((entry) =>
      normalizeCatalogEntry(entry, kind === "tours" ? "tour" : "experience", ids),
    );
  }
  if (Buffer.byteLength(JSON.stringify(normalized)) > 512 * 1024) {
    throw new Error("Catalog exceeds the maximum allowed size.");
  }
  return normalized;
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(value));
}

function parseCookies(header = "") {
  const cookies = new Map();
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    cookies.set(name, value);
  }
  return cookies;
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function normalizeContent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Content must be an object keyed by language.");
  }

  const normalized = {};
  for (const [language, entries] of Object.entries(value)) {
    if (
      !languages.has(language) ||
      !entries ||
      typeof entries !== "object" ||
      Array.isArray(entries)
    ) {
      throw new Error(`Invalid content data for language "${language}".`);
    }

    normalized[language] = {};
    for (const [key, text] of Object.entries(entries)) {
      if (
        !/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*$/.test(key) ||
        typeof text !== "string" ||
        text.length > 2000
      ) {
        throw new Error(`Invalid content entry "${language}.${key}".`);
      }
      normalized[language][key] = text;
    }
  }

  if (Buffer.byteLength(JSON.stringify(normalized)) > maxContentBytes) {
    throw new Error("Content exceeds the maximum allowed size.");
  }
  return normalized;
}

async function readJsonBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxRequestBytes) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function createApplication({
  adminUsername,
  adminPassword,
  contentFile = path.join(rootDirectory, "data", "content.json"),
  catalogFile = path.join(rootDirectory, "data", "catalog.json"),
  secureCookies = false,
  telegramBotToken = process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId = process.env.TELEGRAM_CHAT_ID,
  telegramApiBase = "https://api.telegram.org",
  fetchImpl = globalThis.fetch,
}) {
  if (typeof adminUsername !== "string" || !adminUsername.trim()) {
    throw new Error("Set ADMIN_USERNAME before starting the server.");
  }
  if (typeof adminPassword !== "string" || adminPassword.length < 12) {
    throw new Error("Set ADMIN_PASSWORD to a password of at least 12 characters.");
  }

  const passwordSalt = crypto.randomBytes(16);
  const passwordHash = crypto.scryptSync(adminPassword, passwordSalt, 64);
  const sessions = new Map();
  const loginAttempts = new Map();
  const contactAttempts = new Map();
  let content = {};
  let catalog;
  let writeQueue = Promise.resolve();

  async function loadContent() {
    try {
      const fileContent = await fs.readFile(contentFile, "utf8");
      content = normalizeContent(JSON.parse(fileContent));
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw new Error(`Could not load content from ${contentFile}: ${error.message}`);
    }
  }

  async function loadCatalog() {
    try {
      catalog = normalizeCatalog(JSON.parse(await fs.readFile(catalogFile, "utf8")));
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw new Error(
        `Could not load catalog from ${catalogFile}: ${error.message}`,
      );
    }
  }

  function getSession(request) {
    const token = parseCookies(request.headers.cookie).get(sessionCookieName);
    if (!token) return undefined;
    const session = sessions.get(token);
    if (!session) return undefined;
    if (session.expiresAt <= Date.now()) {
      sessions.delete(token);
      return undefined;
    }
    return { token, ...session };
  }

  function isSameOrigin(request) {
    const origin = request.headers.origin;
    if (!origin || !request.headers.host) return false;
    try {
      const parsedOrigin = new URL(origin);
      const expectedProtocol = secureCookies ? "https:" : "http:";
      return (
        parsedOrigin.protocol === expectedProtocol &&
        parsedOrigin.host === request.headers.host
      );
    } catch {
      return false;
    }
  }

  function hasValidCsrfToken(request, session) {
    const suppliedToken = request.headers["x-csrf-token"];
    return (
      typeof suppliedToken === "string" &&
      constantTimeEqual(suppliedToken, session.csrfToken)
    );
  }

  function getLoginAttempts(request) {
    const address = request.socket.remoteAddress || "unknown";
    const current = loginAttempts.get(address);
    if (!current || current.resetAt <= Date.now()) {
      const next = { count: 0, resetAt: Date.now() + loginWindowMs };
      loginAttempts.set(address, next);
      return next;
    }
    return current;
  }

  function getContactAttempts(request) {
    const address = request.socket.remoteAddress || "unknown";
    const current = contactAttempts.get(address);
    if (!current || current.resetAt <= Date.now()) {
      const next = { count: 0, resetAt: Date.now() + contactWindowMs };
      contactAttempts.set(address, next);
      return next;
    }
    return current;
  }

  function cleanSingleLine(value) {
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  }

  function getContactText(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Please check the enquiry form and try again.");
    }

    const name =
      typeof body.name === "string" ? cleanSingleLine(body.name) : "";
    const email =
      typeof body.email === "string" ? cleanSingleLine(body.email) : "";
    const tour = typeof body.tour === "string" ? body.tour : "";
    const interest = typeof body.interest === "string" ? body.interest : "";
    const language = typeof body.language === "string" ? body.language : "en";
    const message =
      typeof body.message === "string"
        ? body.message
            .replace(/\r\n?/g, "\n")
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
            .trim()
        : "";
    const travelers = Number(body.travelers);

    if (!name || name.length > 100) {
      throw new Error("Enter a name of 1 to 100 characters.");
    }
    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new Error("Enter a valid email address.");
    }
    const knownTours = catalog
      ? catalog.tours.map((entry) => entry.id)
      : ["ala", "song", "issyk", "kelsuu", "jetioguz", "karakol"];
    if (tour && !knownTours.includes(tour)) {
      throw new Error("Choose a valid tour.");
    }
    if (
      ![
        "general",
        "partner",
        "experience",
        "horse",
        "yurt",
        "food",
        "trek",
        "canyon",
        "eagle",
      ].includes(interest)
    ) {
      throw new Error("Choose a valid enquiry topic.");
    }
    if (!Number.isInteger(travelers) || travelers < 1 || travelers > 20) {
      throw new Error("Choose between 1 and 20 travelers.");
    }
    if (!languages.has(language) || message.length > 2000) {
      throw new Error("Please check the message and try again.");
    }

    const translations = content[language] || {};
    const defaultTourNames = {
      ala: "Ala-Archa, on foot",
      song: "A night at Song-Kul",
      issyk: "Issyk-Kul, canyons & local food",
      kelsuu: "Kel-Suu by horseback",
      jetioguz: "Jeti-Oguz, Barskoon & Skazka",
      karakol: "Karakol horse ride & yurt",
    };
    const catalogTour = catalog?.tours.find((entry) => entry.id === tour);
    const tourName = tour
      ? catalogTour?.fields[language].title ||
        translations[`trip.${tour}.title`] ||
        defaultTourNames[tour] ||
        tour
      : "Not selected";
    const interestKeys = {
      general: "contacts.form.general",
      partner: "contacts.form.partner",
      experience: "contacts.form.experience",
      horse: "experiences.horse.title",
      yurt: "experiences.yurt.title",
      food: "experiences.food.title",
      trek: "experiences.trek.title",
      canyon: "experiences.canyon.title",
      eagle: "experiences.eagle.title",
    };
    const defaultInterestNames = {
      general: "A trip to Kyrgyzstan",
      partner: "Partnering with TravelHorizon",
      experience: "A local experience",
      horse: "On horseback",
      yurt: "A yurt stay",
      food: "Local food",
      trek: "A mountain trek",
      canyon: "Canyons and waterfalls",
      eagle: "Eagle-hunter demonstration",
    };
    const interestName =
      translations[interestKeys[interest]] || defaultInterestNames[interest];
    const defaultTourPrices = {
      ala: 70,
      issyk: 80,
      jetioguz: 120,
      karakol: 120,
    };
    const priceText = tour
      ? catalogTour?.fields[language].price ||
        translations[`trip.${tour}.price`] ||
        (defaultTourPrices[tour] ? `$${defaultTourPrices[tour]}` : "")
      : "";
    const priceMatch = priceText.match(/\d[\d,]*(?:\.\d+)?/);
    const price = priceMatch
      ? Number(priceMatch[0].replace(/,/g, ""))
      : undefined;
    const total = Number.isFinite(price)
      ? `\nIndicative starting total (not a quote): $${(
          price * travelers
        ).toLocaleString("en-US")}`
      : "";

    return [
      "New TravelHorizon enquiry",
      `Name: ${name}`,
      `Email: ${email}`,
      `Tour: ${tourName}`,
      `Travelers: ${travelers}`,
      `Interested in: ${interestName}`,
      `Message: ${message || "-"}`,
    ].join("\n") + total;
  }

  function sessionCookie(token, maxAge = Math.floor(sessionLifetimeMs / 1000)) {
    return [
      `${sessionCookieName}=${token}`,
      "HttpOnly",
      "Path=/",
      "SameSite=Strict",
      `Max-Age=${maxAge}`,
      ...(secureCookies ? ["Secure"] : []),
    ].join("; ");
  }

  async function saveContent(nextContent) {
    const serialized = JSON.stringify(nextContent, null, 2);
    const write = writeQueue.then(async () => {
      await fs.mkdir(path.dirname(contentFile), { recursive: true });
      const temporaryFile = `${contentFile}.${crypto.randomBytes(8).toString("hex")}.tmp`;
      await fs.writeFile(temporaryFile, serialized, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      await fs.rename(temporaryFile, contentFile);
    });
    writeQueue = write.then(
      () => undefined,
      () => undefined,
    );
    await write;
    content = nextContent;
  }

  async function saveCatalog(nextCatalog) {
    const serialized = JSON.stringify(nextCatalog, null, 2);
    const write = writeQueue.then(async () => {
      await fs.mkdir(path.dirname(catalogFile), { recursive: true });
      const temporaryFile = `${catalogFile}.${crypto.randomBytes(8).toString("hex")}.tmp`;
      await fs.writeFile(temporaryFile, serialized, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      await fs.rename(temporaryFile, catalogFile);
    });
    writeQueue = write.then(
      () => undefined,
      () => undefined,
    );
    await write;
    catalog = nextCatalog;
  }

  async function handleApi(request, response, pathname) {
    if (pathname === "/api/content" && request.method === "GET") {
      sendJson(response, 200, content);
      return;
    }

    if (pathname === "/api/catalog" && request.method === "GET") {
      sendJson(response, 200, { catalog: catalog || null });
      return;
    }

    if (pathname === "/api/contact" && request.method === "POST") {
      if (!isSameOrigin(request)) {
        sendJson(response, 403, { error: "Request origin was rejected." });
        return;
      }
      if (
        typeof telegramBotToken !== "string" ||
        !telegramBotToken ||
        typeof telegramChatId !== "string" ||
        !telegramChatId
      ) {
        sendJson(response, 503, {
          error:
            "Contact delivery is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID on the server.",
        });
        return;
      }

      const attempts = getContactAttempts(request);
      if (attempts.count >= maxContactAttempts) {
        sendJson(response, 429, {
          error: "Too many enquiries. Please try again in 15 minutes.",
        });
        return;
      }

      let text;
      try {
        text = getContactText(await readJsonBody(request));
      } catch (error) {
        sendJson(response, error.statusCode || 400, { error: error.message });
        return;
      }

      attempts.count += 1;
      try {
        const telegramResponse = await fetchImpl(
          `${telegramApiBase}/bot${telegramBotToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: telegramChatId,
              text,
              disable_web_page_preview: true,
            }),
            signal: AbortSignal.timeout(10_000),
          },
        );
        let telegramResult;
        try {
          telegramResult = await telegramResponse.json();
        } catch {
          telegramResult = undefined;
        }
        if (!telegramResponse.ok || telegramResult?.ok !== true) {
          console.error(
            `Telegram rejected an enquiry (HTTP ${telegramResponse.status}).`,
          );
          sendJson(response, 502, {
            error: "Telegram could not deliver your enquiry. Please try again.",
          });
          return;
        }
      } catch (error) {
        console.error(
          `Telegram delivery failed (${error.name || "request error"}).`,
        );
        sendJson(response, 502, {
          error: "Telegram could not deliver your enquiry. Please try again.",
        });
        return;
      }

      sendJson(response, 200, { sent: true });
      return;
    }

    if (
      pathname === "/api/admin/catalog" &&
      (request.method === "PUT" || request.method === "DELETE")
    ) {
      const session = getSession(request);
      if (!session) {
        sendJson(response, 401, { error: "Sign-in required." });
        return;
      }
      if (!isSameOrigin(request) || !hasValidCsrfToken(request, session)) {
        sendJson(response, 403, { error: "Request verification failed." });
        return;
      }

      let nextCatalog;
      if (request.method === "PUT") {
        try {
          const body = await readJsonBody(request);
          nextCatalog = normalizeCatalog(body?.catalog);
        } catch (error) {
          sendJson(response, error.statusCode || 400, { error: error.message });
          return;
        }
      }

      try {
        if (nextCatalog) {
          await saveCatalog(nextCatalog);
        } else {
          await fs.rm(catalogFile, { force: true });
          catalog = undefined;
        }
      } catch (error) {
        console.error("Could not save site catalog.", error);
        sendJson(response, 500, { error: "Could not save site catalog." });
        return;
      }
      sendJson(response, 200, { saved: true });
      return;
    }

    if (pathname === "/api/admin/login" && request.method === "POST") {
      if (!isSameOrigin(request)) {
        sendJson(response, 403, { error: "Request origin was rejected." });
        return;
      }

      const attempts = getLoginAttempts(request);
      if (attempts.count >= maxLoginAttempts) {
        sendJson(response, 429, {
          error: "Too many sign-in attempts. Try again in 15 minutes.",
        });
        return;
      }

      let credentials;
      try {
        credentials = await readJsonBody(request);
      } catch (error) {
        sendJson(response, error.statusCode || 400, { error: error.message });
        return;
      }

      const username =
        typeof credentials?.username === "string" ? credentials.username : "";
      const password =
        typeof credentials?.password === "string" ? credentials.password : "";
      const suppliedHash = crypto.scryptSync(password.slice(0, 1024), passwordSalt, 64);
      const validCredentials =
        constantTimeEqual(username, adminUsername) &&
        crypto.timingSafeEqual(suppliedHash, passwordHash);
      if (!validCredentials) {
        attempts.count += 1;
        sendJson(response, 401, { error: "Username or password is incorrect." });
        return;
      }

      loginAttempts.delete(request.socket.remoteAddress || "unknown");
      const token = crypto.randomBytes(32).toString("base64url");
      const csrfToken = crypto.randomBytes(32).toString("base64url");
      sessions.set(token, {
        csrfToken,
        expiresAt: Date.now() + sessionLifetimeMs,
      });
      sendJson(
        response,
        200,
        { authenticated: true },
        { "Set-Cookie": sessionCookie(token) },
      );
      return;
    }

    if (
      pathname === "/api/admin/session" &&
      request.method === "GET"
    ) {
      const session = getSession(request);
      if (!session) {
        sendJson(response, 401, { error: "Sign-in required." });
        return;
      }
      sendJson(response, 200, {
        authenticated: true,
        csrfToken: session.csrfToken,
      });
      return;
    }

    if (
      pathname === "/api/admin/content" &&
      (request.method === "PUT" || request.method === "DELETE")
    ) {
      const session = getSession(request);
      if (!session) {
        sendJson(response, 401, { error: "Sign-in required." });
        return;
      }
      if (!isSameOrigin(request) || !hasValidCsrfToken(request, session)) {
        sendJson(response, 403, { error: "Request verification failed." });
        return;
      }

      let nextContent = {};
      if (request.method === "PUT") {
        try {
          const body = await readJsonBody(request);
          nextContent = normalizeContent(body?.content);
        } catch (error) {
          sendJson(response, error.statusCode || 400, { error: error.message });
          return;
        }
      }

      try {
        await saveContent(nextContent);
      } catch (error) {
        console.error("Could not save site content.", error);
        sendJson(response, 500, { error: "Could not save site content." });
        return;
      }
      sendJson(response, 200, { saved: true });
      return;
    }

    if (pathname === "/api/admin/logout" && request.method === "POST") {
      const session = getSession(request);
      if (!session) {
        sendJson(response, 401, { error: "Sign-in required." });
        return;
      }
      if (!isSameOrigin(request) || !hasValidCsrfToken(request, session)) {
        sendJson(response, 403, { error: "Request verification failed." });
        return;
      }
      sessions.delete(session.token);
      sendJson(
        response,
        200,
        { loggedOut: true },
        { "Set-Cookie": sessionCookie("", 0) },
      );
      return;
    }

    sendJson(response, 404, { error: "API endpoint not found." });
  }

  function sendStaticFile(response, filePath) {
    fs.readFile(filePath)
      .then((file) => {
        response.writeHead(200, {
          "Cache-Control":
            filePath.endsWith("admin.html") ||
            filePath.endsWith("admin-login.html")
            ? "no-store"
            : "public, max-age=300",
          "Content-Type":
            mimeTypes[path.extname(filePath)] || "application/octet-stream",
        });
        response.end(file);
      })
      .catch((error) => {
        if (error.code === "ENOENT" || error.code === "EISDIR") {
          response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Not found");
          return;
        }
        console.error(`Could not serve ${filePath}.`, error);
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Internal server error");
      });
  }

  const server = http.createServer((request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Frame-Options", "DENY");
    if (secureCookies) {
      response.setHeader("Strict-Transport-Security", "max-age=31536000");
    }
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://thumb.wikimedia.org https://upload.wikimedia.org data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );

    let url;
    try {
      url = new URL(request.url, "http://localhost");
    } catch {
      response.writeHead(400);
      response.end("Bad request");
      return;
    }
    const pathname = url.pathname;

    if (pathname.startsWith("/api/")) {
      void handleApi(request, response, pathname).catch((error) => {
        console.error("API request failed.", error);
        if (!response.headersSent) {
          sendJson(response, 500, { error: "Internal server error." });
        } else {
          response.destroy(error);
        }
      });
      return;
    }

    if (pathname === "/admin.html") {
      const session = getSession(request);
      sendStaticFile(
        response,
        path.join(rootDirectory, session ? "admin.html" : "admin-login.html"),
      );
      return;
    }

    if (pathname === "/admin-login.html") {
      sendStaticFile(response, path.join(rootDirectory, "admin-login.html"));
      return;
    }

    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    if (!staticFiles.has(relativePath)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    const filePath = path.resolve(rootDirectory, relativePath);
    if (
      filePath !== rootDirectory &&
      !filePath.startsWith(`${rootDirectory}${path.sep}`)
    ) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    if (
      filePath.startsWith(`${path.join(rootDirectory, "data")}${path.sep}`) ||
      path.basename(filePath).startsWith(".")
    ) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    sendStaticFile(response, filePath);
  });

  return {
    server,
    loadContent,
    loadCatalog,
  };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "0.0.0.0";
  const { server, loadContent, loadCatalog } = createApplication({
    adminUsername: process.env.ADMIN_USERNAME,
    adminPassword: process.env.ADMIN_PASSWORD,
    contentFile:
      process.env.CONTENT_FILE || path.join(rootDirectory, "data", "content.json"),
    secureCookies: process.env.NODE_ENV === "production",
    catalogFile:
      process.env.CATALOG_FILE || path.join(rootDirectory, "data", "catalog.json"),
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
  });

  Promise.all([loadContent(), loadCatalog()])
    .then(() => {
      server.listen(port, host, () => {
        console.log(`TravelHorizon server listening on http://${host}:${port}`);
      });
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { createApplication, normalizeContent };
