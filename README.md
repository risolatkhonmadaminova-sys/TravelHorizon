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

## Deploy to Vercel

Deploy the repository root to Vercel. `vercel.json` configures the API function
and includes the bundled catalog and content JSON files. The public website,
`/api/content`, and `/api/catalog` work without environment variables.

Admin editing is disabled unless `ADMIN_USERNAME`, an `ADMIN_PASSWORD` of at
least 12 characters, and a Vercel Blob read-write token are configured. Create
a **private** Vercel Blob store and add its `BLOB_READ_WRITE_TOKEN` to the
project's server-side environment variables. Admin changes are stored in that
private store while public visitors continue to load content through the API.
If admin credentials or storage are missing, login and all editing endpoints
return an error and the browser disables the login form. Local development
continues to use the JSON files.

Telegram enquiries are optional. Set `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_CHAT_ID` as private environment variables to enable delivery. If they
are missing or Telegram is unavailable, the contact form reports the delivery
failure without affecting the rest of the website.

## Tests

```sh
npm test
```
