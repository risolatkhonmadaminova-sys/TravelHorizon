# TravelHorizon

## Run locally

Requires Node.js 20 or newer and PostgreSQL. Create a database, then copy
`.env.example` to `.env` and set `DATABASE_URL` to its connection URL. Set the
admin credentials if you want to enable the Admin Panel:

```sh
cp .env.example .env
# Set DATABASE_URL, ADMIN_USERNAME, and ADMIN_PASSWORD in .env.
npm install
npm start
```

`npm start` first runs the one-time JSON seed migration, then starts the server.
You can run `npm run db:migrate` separately; it is safe to rerun and leaves
database content unchanged once the migration has been recorded. Open
<http://localhost:3000>. Do not open the HTML files directly or use a static
preview such as VS Code Live Server: API functionality requires the backend.
Admin access is disabled until `ADMIN_USERNAME` and an `ADMIN_PASSWORD` of at
least 12 characters are configured. Only a valid administrator session can
change or restore site content, and the server checks that session and a CSRF
token again when saving.

The original `data/content.json` and `data/catalog.json` files are retained as
one-time migration seeds. Ongoing content reads and writes go through the
backend to PostgreSQL; the JSON files are not updated by the application.

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

## Local PostgreSQL with Docker Compose

Install and start Docker Desktop first. Keep your existing `.env` file and
credentials; do not overwrite it. If this is a fresh checkout without `.env`,
create it from the example:

```sh
test -f .env || cp .env.example .env
```

In `.env`, set a strong, unique local `POSTGRES_PASSWORD`. Set `DATABASE_URL`
to the matching PostgreSQL connection URL, for example:

```dotenv
POSTGRES_DB=travelhorizon
POSTGRES_USER=travelhorizon_user
POSTGRES_PASSWORD=your-strong-local-password
DATABASE_URL=postgresql://travelhorizon_user:your-strong-local-password@localhost:5432/travelhorizon
```

Use the same database name, user, and password in both settings. If the
password contains URL-special characters, percent-encode it in `DATABASE_URL`.
Never commit `.env`; `.gitignore` already excludes it.

From the TravelHorizon project root in VS Code Terminal:

1. Start the database container:

   ```sh
   docker compose up -d
   ```

2. Check container health and startup logs:

   ```sh
   docker compose ps
   docker compose logs postgres
   ```

   Wait until the `postgres` service reports `healthy`.

3. The Node.js backend connects using `DATABASE_URL` from `.env`. Run the
   existing JSON-to-PostgreSQL import:

   ```sh
   npm run db:migrate
   ```

   The command is safe to rerun; an already-imported database is not
   overwritten.

4. Start the application (this also runs the safe migration hook):

   ```sh
   npm start
   ```

   Open <http://localhost:3000>.

5. To inspect the schema, migration record, and imported tours/experiences:

   ```sh
   docker compose exec postgres psql -U travelhorizon_user -d travelhorizon -c '\dt'
   docker compose exec postgres psql -U travelhorizon_user -d travelhorizon -c 'SELECT name, applied_at FROM schema_migrations;'
   docker compose exec postgres psql -U travelhorizon_user -d travelhorizon -c 'SELECT kind, COUNT(*) FROM catalog_items GROUP BY kind ORDER BY kind;'
   docker compose exec postgres psql -U travelhorizon_user -d travelhorizon -c 'SELECT id, kind, sort_order FROM catalog_items ORDER BY kind, sort_order;'
   ```

6. Stop the container without deleting its data:

   ```sh
   docker compose stop postgres
   ```

   Or use `docker compose down`; it preserves the named data volume. **Do not
   use `docker compose down -v`**, which deletes the database volume.

7. Restart and verify persistence:

   ```sh
   docker compose start postgres
   docker compose ps
   docker compose exec postgres psql -U travelhorizon_user -d travelhorizon -c 'SELECT kind, COUNT(*) FROM catalog_items GROUP BY kind ORDER BY kind;'
   ```

   The catalog counts and records should remain present after the restart. The
   persistent named volume is `travelhorizon_postgres_data`.

This Compose service is for local development only. On Render, set
`DATABASE_URL` to the hosted Render PostgreSQL URL; Render does not need Docker
or this local container.

## Deploy to Render

Create a **PostgreSQL** database and a **Web Service** in Render, then connect
the service to the database. Use the repository root, choose the Node runtime,
and enter:

- **Build Command:** `npm install`
- **Start Command:** `npm start`

The server listens on Render's `PORT` and on `0.0.0.0`. Render supplies `PORT`;
do not set it yourself.

In the web service's **Environment** settings, add:

- `DATABASE_URL` = the PostgreSQL database's **Internal Database URL**. If the
  service and database are in different regions, use the database's External
  URL instead. Keep the URL private.
- `NODE_ENV` = `production`, so administrator session cookies use the Secure
  flag.

Do not remove or overwrite any existing environment variables. Admin login is
optional; set `ADMIN_USERNAME` and `ADMIN_PASSWORD` (at least 12 characters)
privately to enable it. Telegram enquiries are optional; set
`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` privately to enable delivery. Render
supplies `PORT`.

On its first start, the `npm start` prestart hook creates the tables and imports
the JSON seed files once. Later starts use PostgreSQL and do not overwrite
database edits.

Never put real credentials in source files or commit them. Admin sessions are
kept in server memory and expire after 12 hours. If Telegram variables are
missing or Telegram is unavailable, the contact form reports delivery failure
without affecting the rest of the website.

### Content storage and persistence

PostgreSQL is the source of truth for page-content overrides and all tours and
experiences. The schema contains:

- `site_content`: localized page-copy overrides as JSONB.
- `catalog_items`: one row per tour or experience, including its type, order,
  filters/topic, localized fields, image attribution, and listing URL.
- `catalog_state`: whether the catalog has been initialized or reset.
- `schema_migrations`: records the one-time seed import.

The JSON files are retained and versioned only as the initial import source;
the application does not use them for API reads or writes after migration.

To migrate manually, set `DATABASE_URL` to the target database and run
`npm run db:migrate` from the project directory. This imports every localized
field, image attribution, tour filter, and experience link from the existing
seed files. A migration record makes repeat runs safe and prevents overwriting
subsequent Admin Panel edits. The normal server startup also initializes the
schema. `npm start` applies the migration first, and the server fails fast if
the seed migration has not been applied.

## Tests

```sh
npm test
```

To test the app locally, run `npm install`, then `npm test`, then `npm start`.
Set up PostgreSQL and configure `DATABASE_URL` before `npm start`. Open
<http://localhost:3000>. You can check the public JSON endpoints with
`curl http://localhost:3000/api/content` and
`curl http://localhost:3000/api/catalog`. Interactive OpenAPI documentation
for the existing public and admin API operations is available at
<http://localhost:3000/api-docs>. Admin editing remains disabled unless you
configure private credentials. Sign in at
<http://localhost:3000/admin.html> to add, edit, delete, or restore catalog
entries and update page text. Changes are immediately written to PostgreSQL;
refreshing the page reloads them from the API.

The regular API tests use an isolated test store. To also run the PostgreSQL
integration test against a disposable test database, set `TEST_DATABASE_URL`
and run `npm test`; the test creates and removes its own temporary schema.
Never point `TEST_DATABASE_URL` at a production database.
