# TravelHorizon

## Run locally

Requires Node.js 20 or newer. Set an administrator username and a password of
at least 12 characters in a private `.env` file. Start from the example:

```sh
cp .env.example .env
# Replace the placeholder values in .env with your private credentials.
npm start
```

Open <http://localhost:3000>. Choose **Site editor** or visit `/admin.html` to
open the sign-in page. Enter the configured administrator username and
password; incorrect credentials do not open the editor. Only a valid
administrator session can change or restore site content, and the server
checks that session and a CSRF token again when saving. From the editor you can
change site text and add, edit, or delete tours and experiences, including
their prices, translated details, and Wikimedia image/attribution information.
Changes are shared with site visitors and remain after a restart. Sign out by
using the admin panel's sign-out button. Do not open the HTML files directly or
use a static preview such as VS Code Live Server: the editor requires this Node
backend for sign-in and saving changes.

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

## Deploy securely

Deploy the Node server and site together; serving the HTML files from a separate
static host bypasses the authentication gate and will not use the shared
content API. Configure `ADMIN_USERNAME`, `ADMIN_PASSWORD`,
`TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_ID` as private environment variables on
the server. Use HTTPS in production and set
`NODE_ENV=production` so the admin session cookie is marked `Secure`.

The server stores text edits in `data/content.json` and managed tours and
experiences in `data/catalog.json`. Use persistent storage for these files (or
configure `CONTENT_FILE` and `CATALOG_FILE` to persistent mounted paths). The
server keeps admin sessions in memory; a restart signs admins out. Configure a
reverse proxy or platform ingress to provide HTTPS and persistent storage
before public use.

## Tests

```sh
npm test
```
