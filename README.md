# TravelHorizon

## Run locally

Requires Node.js 20 or newer. The public website runs without configuration:

```sh
npm start
```

Open <http://localhost:3000>. The Admin Panel is disabled until
`ADMIN_USERNAME` and an `ADMIN_PASSWORD` of at least 12 characters are
configured in a private `.env` file. Copy `.env.example` and fill those values
with private credentials if you want to enable it. Only a valid administrator
session can change or restore site content, and the server checks that session
and a CSRF token again when saving.
Changes made with the local Node server are stored in `data/content.json` and
`data/catalog.json`. Do not open the HTML files directly or use a static
preview such as VS Code Live Server: API functionality requires the backend.

The credentials are server environment variables and are never sent to the
browser. Keep them private and do not commit them. Set `PORT` to change the
default port (`3000`).

## Telegram enquiries

Create a bot with Telegram's `@BotFather`, start a chat with that bot (or add it
to the company group), then configure `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_CHAT_ID` on the server. The contact form sends enquiries through the
backend to that chat; the bot token is never included in the website or browser
requests. To find the chat ID, send a message to the bot and inspect the
`chat.id` value returned by Telegram's `getUpdates` API. For a group, add the bot
to the group first. The bot must be allowed to post in the target chat.

Keep the bot token private and rotate it with `@BotFather` if it is exposed.
Contact enquiries are rate-limited per IP address.

## Tour and photo sourcing

Displayed prices are indicative provider "from" rates checked on 2 November
2026, not date-specific quotes. Song-Kul and Kel-Suu show "Rate on request"
because no public price was listed. Confirm the final price, current access,
availability, and trip details when enquiring.

The catalog editor accepts HTTPS image URLs from Wikimedia Commons
(`thumb.wikimedia.org` or `upload.wikimedia.org`) and requires photographer and
license attribution. Follow each license's attribution and share-alike terms
when reusing an image.

## Deploy to Render

Create a **Web Service** in Render and connect this repository. Use the
repository root, choose the Node runtime, and enter:

- **Build Command:** `npm install`
- **Start Command:** `npm start`

The server listens on Render's `PORT` and on `0.0.0.0`. No environment
variables are required for the public website or its content and catalog APIs.
Render supplies `PORT`; do not set it yourself.

Admin login and editing are disabled unless `ADMIN_USERNAME` and an
`ADMIN_PASSWORD` of at least 12 characters are configured as private Render
environment variables. Never put real credentials in source files or commit
them. Admin sessions are kept in server memory and expire after 12 hours.

Telegram enquiries are optional. Set `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_CHAT_ID` as private environment variables to enable delivery. If they
are missing or Telegram is unavailable, the contact form reports the delivery
failure without affecting the rest of the website.

### Content storage and persistence

The server reads and writes `data/content.json` and `data/catalog.json`.
`data/` is intentionally excluded from Git, so a new Render instance uses the
website's built-in page content. The catalog API returns valid JSON with a
`null` catalog until a saved catalog exists; the browser builds its default
tours and experiences from the existing pages. Without a Render persistent
disk, edits saved by the Admin Panel are stored on the instance's local
filesystem and **will not reliably survive a restart, redeploy, or instance
replacement**. This project does not configure persistent storage
automatically.

To keep admin edits, attach a persistent disk to the Render service, mount it
at `/var/data`, then set these environment variables in the Render dashboard:

- `CONTENT_FILE` = `/var/data/content.json`
- `CATALOG_FILE` = `/var/data/catalog.json`

Only files saved after the disk is mounted are stored there; seed any existing
content you need to keep. Without a persistent disk, leave Admin Panel login
disabled or treat edits as temporary.

## Tests

```sh
npm test
```

To test the app locally, run `npm install`, then `npm test`, then `npm start`.
Open <http://localhost:3000>. You can check the public JSON endpoints with
`curl http://localhost:3000/api/content` and
`curl http://localhost:3000/api/catalog`. Admin editing remains disabled
unless you configure private credentials.
