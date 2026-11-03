const path = require("node:path");
const { createApplication } = require("../server");

const isVercel = process.env.VERCEL === "1";
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
const adminCredentialsConfigured =
  typeof process.env.ADMIN_USERNAME === "string" &&
  Boolean(process.env.ADMIN_USERNAME.trim()) &&
  typeof process.env.ADMIN_PASSWORD === "string" &&
  process.env.ADMIN_PASSWORD.length >= 12;

function createBlobStorage(token) {
  const { del, get, put } = require("@vercel/blob");
  const read = async (pathname) => {
    const blob = await get(pathname, {
      access: "private",
      token,
      useCache: false,
    });
    if (!blob) return undefined;
    return JSON.parse(await new Response(blob.stream).text());
  };
  const write = async (pathname, value) => {
    await put(pathname, JSON.stringify(value), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "application/json",
      token,
    });
  };

  return {
    readContent: () => read("travelhorizon/content.json"),
    readCatalog: () => read("travelhorizon/catalog.json"),
    writeContent: (value) => write("travelhorizon/content.json", value),
    writeCatalog: (value) => write("travelhorizon/catalog.json", value),
    deleteCatalog: () =>
      del("travelhorizon/catalog.json", { token }),
  };
}

const storage = isVercel && blobToken ? createBlobStorage(blobToken) : undefined;
const application = createApplication({
  adminUsername: process.env.ADMIN_USERNAME,
  adminPassword: process.env.ADMIN_PASSWORD,
  secureCookies: true,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  storage,
  enableAdmin:
    adminCredentialsConfigured && (!isVercel || Boolean(storage)),
  contentFile: path.join(__dirname, "..", "data", "content.json"),
  catalogFile: path.join(__dirname, "..", "data", "catalog.json"),
});
const ready = Promise.all([
  application.loadContent(),
  application.loadCatalog(),
]);

module.exports = async function handler(request, response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Strict-Transport-Security", "max-age=31536000");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://thumb.wikimedia.org https://upload.wikimedia.org data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  );

  try {
    await ready;
    const pathname = new URL(request.url, "https://localhost").pathname;
    await application.handleApi(request, response, pathname);
  } catch (error) {
    console.error("TravelHorizon API request failed.", error);
    if (!response.headersSent) {
      response.writeHead(500, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({ error: "Internal server error." }));
    } else {
      response.end();
    }
  }
};
